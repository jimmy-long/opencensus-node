const AS = require('../build/src/azure-stats');
const OC = require('@opencensus/core');

function exportSingleMetric() {
    // Construct and register an AzureStatsExporter with the OpenCensus library.
    const exporter = new AS.AzureStatsExporter({
        instrumentationKey: 'fa3cb2ed-0f0d-463d-a8f2-0c0c382fa9fc',
        logger: new OC.logger.ConsoleLogger(process.argv[2] || 'info'),
        periodInMillis: 15000,
        exportMode: AS.ExportMode.BATCH,
        aggregationMethod: AS.AggregationMethod.AVERAGE
    });
    OC.globalStats.registerExporter(exporter);

    // Create a dummy metric.
    const mDummy2 = OC.globalStats.createMeasureInt64('test/dummy2', OC.MeasureUnit.UNIT, 'This variable has absolutely no meaning.');
    const dumbTagKey = { name: 'dumb' };

    const view = OC.globalStats.createView(
        'dummy/view2',
        mDummy2,
        OC.AggregationType.SUM,
        [dumbTagKey],
        'An average of the dummy measure.'
    );
    OC.globalStats.registerView(view);

    // Create the tag map so we can set values for our dummy tags.
    const tags = new OC.TagMap();

    // Set a value for each.
    tags.set(dumbTagKey, { value: 'dumb' });

    // Loop through an arbitrary amount of numbers, and record them as 'metrics'.
    setInterval(() => {
        let randomCap = Math.floor(Math.random() * 901) + 100;
        let randomFloor = Math.floor(Math.random() * randomCap);
        for (let i = 0; i < 100; i++) {
            let randomNum = Math.floor(Math.random() * (randomCap + 1)) + randomFloor;
            OC.globalStats.record([{
                measure: mDummy2,
                value: randomNum
            }], tags);    
        }
    }, 6000);

}

exportSingleMetric();
