// Import Core OpenCensus and our Azure Exporter module.
import OpenCensus = require('@opencensus/core');
import AzureStats = require('../src/azure-stats')

function exportSingleMetrics() {
    // Construct and register an AzureStatsExporter with the OpenCensus library.
    const exporter = new AzureStats.AzureStatsExporter({
        instrumentationKey: 'fa3cb2ed-0f0d-463d-a8f2-0c0c382fa9fc',
        logger: new OpenCensus.logger.ConsoleLogger(process.argv[2] || 'info'),
        periodInMillis: 15000,
        exportMode: AzureStats.ExportMode.BATCH
    });
    exporter.start();
    OpenCensus.globalStats.registerExporter(exporter);

    // Create a dummy metric.
    const mDummy = OpenCensus.globalStats.createMeasureInt64('test/dummy', OpenCensus.MeasureUnit.UNIT, 'This variable has absolutely no meaning.');

    // Create some dummy tags.
    const dumbTagKey = { name: 'dumb' };
    const dumberTagKey = { name: 'dumber' };
    const evenDumberTagKey = { name: 'evenDumber' };
    const dumbestTagKey = { name: 'dumbest' };

    // Create some dummy views.
    const sumView = OpenCensus.globalStats.createView(
        'dummy/sumView',
        mDummy,
        OpenCensus.AggregationType.SUM,
        [dumbTagKey],
        'A sum of the dummy measure.'
    );
    OpenCensus.globalStats.registerView(sumView);

    const distributionView = OpenCensus.globalStats.createView(
        'dummy/distView',
        mDummy,
        OpenCensus.AggregationType.DISTRIBUTION,
        [dumbTagKey, dumberTagKey],
        'A distribution of the dummy measure.',
        [0, 5, 10, 15, 20, 25, 30, 35, 40, 45]
    );
    OpenCensus.globalStats.registerView(distributionView);

    const countView = OpenCensus.globalStats.createView(
        'dummy/countView',
        mDummy,
        OpenCensus.AggregationType.COUNT,
        [dumbTagKey, dumberTagKey, evenDumberTagKey],
        'A count of the dummy measure.'
    );
    OpenCensus.globalStats.registerView(countView);

    const lastValueView = OpenCensus.globalStats.createView(
        'dummy/lastValueView',
        mDummy,
        OpenCensus.AggregationType.LAST_VALUE,
        [dumbTagKey, dumberTagKey, evenDumberTagKey, dumbestTagKey],
        'The last value of the dummy measure.'
    );
    OpenCensus.globalStats.registerView(lastValueView);

    // Loop through an arbitrary amount of numbers, and record them as 'metrics'.
    setInterval(() => {
        for (let i = 0; i < 50; i++) {
            // Create the tag map so we can set values for our dummy tags.
            const tags = new OpenCensus.TagMap();
    
            // Set a value for each.
            tags.set(dumbTagKey, { value: 'dumb' });
            tags.set(dumberTagKey, { value: 'dumber' });
            tags.set(evenDumberTagKey, { value: 'evenDumber' });
            tags.set(dumbestTagKey, { value: 'dumbest' });
    
            OpenCensus.globalStats.record([{
                measure: mDummy,
                value: Math.floor(Math.random() * Math.floor(45))
            }], tags);
        }
    }, 5000);
    
}

exportSingleMetrics();
