import {
    ExporterConfig,
    StatsEventListener,
    View,
    Measurement,
    TagKey,
    TagValue,
    logger,
    Logger,
    Metric,
    MetricProducerManager,
    Metrics,
    Measure,
    AggregationData,
    MetricDescriptorType,
} from '@opencensus/core';

import * as ApplicationInsights from 'applicationinsights';

import {
    MetricTelemetry
} from 'applicationinsights/out/Declarations/Contracts';

export interface StatsParams {
    registeredViews: View[];
    registeredMeasures: Measure[];
    recordedData: { [key: string]: AggregationData[] };
}

export enum ExportMode {
    SINGLE_VALUE = 0,
    BATCH = 1
}

export enum AggregationMethod {
    AVERAGE = 0,
    MIN = 1,
    MAX = 2,
    SUM = 3,
    COUNT = 4
}

/**
 * Options for Azure Monitor configuration.
 */
export interface AzureStatsExporterOptions extends ExporterConfig {

    /**
     * The Instrumentation Key found in your application's Azure Monitor Application Insights
     * Overview page. Required.
     */
    instrumentationKey: string;

    /**
     * If specified, dictates the mode the exporter will function in.
     * Optional, defaults to ExportMode.SINGLE_VALUE.
     */
    exportMode?: ExportMode;

    /**
     * If specified, defines the number of milliseconds between uploading metrics
     * to Azure Monitor. Optional, defaults to 60,000 (1 minute).
     */
    periodInMillis?: number;

    /**
     * If specified, this will override the default OpenCensus prefix of an
     * Azure Monitor metric. Optional.
     */
    prefix?: string;

    /**
     * The aggregation method if batch exporting is to be used.
     * Optional, defaults to AggregationMethod.AVERAGE.
     */
    aggregationMethod?: AggregationMethod;

    /**
     * If specified, this will serve as the logger used by the exporter.
     * Optional, default to use whatever logger is registered with OpenCensus.
     */
    logger?: Logger;

    /**
     * If specified, this function will be called whenever an error occurs uploading
     * stats to Azure monitor. Optional.
     */
    onMetricUploadError?: (err: Error) => void;

}

export class IllegalOptionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IllegalOptionsError';
    }
}

/**
 * Configuration defaults for an AzureStatsExporter.
 */
const AZURE_STATS_EXPORTER_DEFAULTS: AzureStatsExporterOptions = {
    instrumentationKey: 'undefined',
    periodInMillis: 60000,
    prefix: 'OpenCensus',
    exportMode: ExportMode.SINGLE_VALUE,
    aggregationMethod: AggregationMethod.AVERAGE,
    logger: logger.logger()
}

/**
 * Formats and sends Stats to Azure Monitor.
 */
export class AzureStatsExporter implements StatsEventListener {
    // Define the options that will be used within the exporter.
    private options: AzureStatsExporterOptions;

    // Define all other exporter variables.
    private timer: NodeJS.Timer;

    /**
     * Configures a new Stats Exporter given a set of options.
     * @param options Specific configuration information to use when constructing the exporter.
     */
    constructor(options: AzureStatsExporterOptions) {
        // Start with the default options, and overwrite the defaults with any options specified
        // in the constructor's options parameter. We do this before validating input so that
        // the logger gets configured with the user specified logger, if provided.
        this.options = { ...AZURE_STATS_EXPORTER_DEFAULTS, ...options };

        // Verify that the options passed in have actual values (no undefined values)
        // for require parameters.
        if (!options.instrumentationKey) {
            this.options.logger.error('You must provide a valid instrumentation key.');
            throw new IllegalOptionsError('You must provide a valid instrumentation key.');
        }

        this.setupAndStartApplicationInsights();
    }

    /**
     * Is called whenever a view is registered.
     * @param view The registered view.
     */
    onRegisterView(view: View): void {
    }

    /**
     * Is called whenever a measure is recorded.
     * @param views The views related to the measurement.
     * @param measurement The recorded measurement.
     * @param tags The tags to which the value is applied.
     */
    // Use the App Insights SDK to track this measurement.
    onRecord(views: View[], measurement: Measurement, tags: Map<TagKey, TagValue>): void {
        if (this.options.exportMode === ExportMode.SINGLE_VALUE) {
            let newMetric: MetricTelemetry = {
                name: measurement.measure.name,
                value: measurement.value
            };

            this.exportSingleMetric(newMetric);
        }
    }

    /**
     * Creates an Azure Monitor Stats exporter with an AzureStatsExporterOptions.
     */
    start(): void {
        // Verify that the exporter is running in batch mode.
        if (!this.verifyBatchMode()) {
            return;
        }

        // Set a timer using the interval (period) defined in the exporter's options.
        // Each time the timer ticks, export any data that has been tracked by utilizing
        // the exporter's export() function.
        this.timer = setInterval(async () => {
            try {
                await this.export();
            } catch (err) {
                if (typeof this.options.onMetricUploadError === 'function') {
                    this.options.onMetricUploadError(err);
                }
            }
        }, this.options.periodInMillis);
        this.options.logger.info('Set export interval to ' + this.options.periodInMillis + ' ms.');
    }

    /**
     * Clear the interval timer to stop uploading metrics. It should be called
     * whenever the exporter is not needed anymore.
     */
    stop(): void {
        // Verify that the exporter is running in batch mode.
        if (!this.verifyBatchMode()) {
            return;
        }

        // Stop the timer.
        clearInterval(this.timer);
        this.options.logger.info('Clearing export interval.');

        this.disposeApplicationInsights();
    }

    /**
     * Polls the Metrics library for all registered metrics and uploads these to Azure Monitor.
     */
    async export() {
        // Verify that the exporter is running in batch mode.
        if (!this.verifyBatchMode()) {
            return;
        }
        
        this.options.logger.info('Starting export of metric batch.');

        // Collect all of the metrics that will need to be exported in this batch.
        const metricList: Metric[] = [];
        const metricProducerManager: MetricProducerManager = Metrics.getMetricProducerManager();

        // According to OpenCensus documentation, MetricProducer.getMetrics() returns a list
        // of metrics to be exported, therefore we will use that function to retrieve metrics.
        const metricProducers = metricProducerManager.getAllMetricProducer()
        this.options.logger.debug('There are ' + metricProducers.size.toString() + ' metric producers.')
        for (const metricProducer of metricProducers) {
            this.options.logger.debug('Processing metrics from: ' + JSON.stringify(metricProducer));

            const metrics = metricProducer.getMetrics();
            this.options.logger.debug('Metric Producer [' + Object.keys(metricProducer)[0] +'] has ' + metrics.length + ' metrics.');
            for (const metric of metricProducer.getMetrics()) {
                if (metric) {
                    this.options.logger.debug("Adding metric [" + metric.descriptor.name + "] to metricList.");
                    this.options.logger.debug(metric.descriptor.name.toUpperCase() + ': ' + JSON.stringify(metric))
                    metricList.push(metric);
                }
            }
        }

        // Aggregate each metric before sending them to Azure Monitor.
        // TODO: Aggregate metrics.
        for (const metric of metricList) {
            this.options.logger.info('Metric: ' + JSON.stringify(metric));
            let aggregateValue: number;
            switch (metric.descriptor.type) {
                case MetricDescriptorType.GAUGE_INT64:
                case MetricDescriptorType.GAUGE_DOUBLE:
                    aggregateValue = this.getMetricAggreation(metric);
                    this.options.logger.info(aggregateValue);
                    break;
                case MetricDescriptorType.CUMULATIVE_INT64:
                case MetricDescriptorType.CUMULATIVE_DOUBLE:
                    // Likely these will be aggregated the same as above, but for now I am keeping them
                    // separate. If same aggregation procedures can be used, we will have all Int64/Doubles
                    // fall through into the same block.
                    break;
                case MetricDescriptorType.GAUGE_DISTRIBUTION:
                    // Need to look into how Azure monitor accepts distribution values.
                    break;
                case MetricDescriptorType.CUMULATIVE_DISTRIBUTION:
                    // Need to look into how Azure monitor accepts distribution values.
                    break;
                case MetricDescriptorType.UNSPECIFIED:
                    // Log a warning as this type should not be used.
                    break;
                default:
            }

            this.exportSingleMetric({
                name: metric.descriptor.name,
                value: aggregateValue
            });
        }
    }

    private getMetricAggreation(metric: Metric) {
        switch(this.options.aggregationMethod) {
            case AggregationMethod.AVERAGE:
                const allPoints = metric.timeseries.map(timeseries  => timeseries.points).reduce((a, b) => [...a, ...b]);
                const allValues : number[] = allPoints.map(point => <number>point.value);

                this.options.logger.debug('Points being logged: ' + allValues);

                return allValues.reduce((a, b) => a + b) / allValues.length;
            }
        return null;
    }

    /**
     * Verifies that that exporter is running batch mode. If it is not,
     * this method will issue a warning log message.
     */
    private verifyBatchMode() : boolean {
        if (this.options.exportMode !== ExportMode.BATCH) {
            this.options.logger.warn('This exporter is not configured to run in batch mode.');
            return false;            
        }
        return true;
    }

    /**
    * Uses the Application Insights SDK to export a given MetricTelemetry object
    * into Azure Monitor.
    * @param metric The MetricTelemetry object to export to Azure Monitor.
    */
    private exportSingleMetric(metric: MetricTelemetry) {
        ApplicationInsights.defaultClient.trackMetric(metric);
        this.options.logger.debug('Tracked metric: ', metric);
    }

    /**
     * Configures setup options and starts an Application Insights SDK client.
     */
    private setupAndStartApplicationInsights() {
        // Configure the Application Insights SDK to use the Instrumentation Key from our options.
        ApplicationInsights.setup(this.options.instrumentationKey).start();
    }

    /**
     * Disposes of the active Application Insights SDK client.
     */
    private disposeApplicationInsights() {
        // Pass the stop signal on to the App Insights SDK.
        ApplicationInsights.dispose();
        this.options.logger.info('Disposed App Insights SDK.');
    }

}
