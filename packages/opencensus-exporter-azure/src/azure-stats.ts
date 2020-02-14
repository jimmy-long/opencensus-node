import {
    ExporterConfig,
    StatsEventListener,
    View,
    Measurement,
    TagKey,
    TagValue,
    logger,
    Logger
} from '@opencensus/core';

import { 
    start as startAppInsights, 
    setup as setupAppInsights,
    dispose as disposeAppInsights,
    defaultClient as telemetry,
    TelemetryClient }
from 'applicationinsights';

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
     * If specified, defines the number of milliseconds between uploading metrics
     * to Azure Monitor. Optional, defaults to 60,000 (1 minute).
     */
    period?: number;

    /**
     * If specified, this will override the default OpenCensus prefix of an
     * Azure Monitor metric. Optional.
     */
    prefix?: string;

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

const AzureStatsExporterDefaults: AzureStatsExporterOptions = {
    instrumentationKey: undefined,
    period: 60000,
    prefix: 'OpenCensus',
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
        // Verify that the options passed in have actual values (no undefined values)
        // for require parameters.
        if (options.instrumentationKey === undefined) {
            AzureStatsExporterDefaults.logger.error('You must specify an Instrumentation Key to create an Azure Monitor Stats Exporter.');
        } 

        // Start with the default options, and overwrite the defaults with any options specified
        // in the constructor's options parameter.
        this.options = { ...AzureStatsExporterDefaults, ...options };

        // Configure the Application Insights SDK to use the Instrumentation Key from our options.
        setupAppInsights(this.options.instrumentationKey);
    }

    /**
     * Is called whenever a view is registered.
     * @param view The registered view.
     */
    onRegisterView(view: View): void {
        throw new Error("Method not implemented.");
    }    
    
    /**
     * Is called whenever a measure is recorded.
     * @param views The views related to the measurement.
     * @param measurement The recorded measurement.
     * @param tags The tags to which the value is applied.
     */
    onRecord(views: View[], measurement: Measurement, tags: Map<TagKey, TagValue>): void {
        throw new Error("Method not implemented.");
    }

    /**
     * Creates an Azure Monitor Stats exporter with an AzureStatsExporterOptions.
     */
    start(): void {
        startAppInsights();
        this.timer = setInterval(async () => {
            try {
                await this.export();
            } catch (err) {
                if (typeof this.options.onMetricUploadError === 'function') {
                    this.options.onMetricUploadError(err);
                }
            }
        }, this.options.period);
    }

    /**
     * Clear the interval timer to stop uploading metrics. It should be called
     * whenever the exporter is not needed anymore.
     */
    stop(): void {
        clearInterval(this.timer);
        disposeAppInsights();
    }

    /**
     * Polls the Metrics library for all registered metrics and uploads these to Azure Monitor.
     */
    async export() {

    }

}