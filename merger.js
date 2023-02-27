#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const convert = require('xml-js');
const { Command } = require('commander');

function getProgram() {
    const program = new Command();

    program
        .name('merge-results')
        .description('Merges results of Cypress tests into one file, which can be uploaded to Ibutsu')
        .option('-c, --config <path>', 'Cypress config file')
        .option('-p, --project <string>', 'Name of the project')
        .option('-m, --component <string>', 'Component being tested')
        .option('-d, --directory <path>', 'Path to the directory with results')
        .option('-s, --source <string>', 'Source from which test is run')
        .option('-e, --environment <string>', 'Environment the test is run in')
        .option('-o, --output <string>', 'Name of the exported file')
        .option('-v, --verbose', 'Output the merged results to console');

    return program;
}

const program = getProgram();

function validateOptions(options) {
    const opts = {};

    if (options.config) {
        const confPath = path.resolve(options.config);
        try {
            fs.accessSync(confPath, fs.constants.R_OK);
        } catch (err) {
            process.stderr.write(
                `ERR: The config file '${confPath}' doesn't exist or permissions aren't set correctly.\n`
            );
            return null;
        }

        if (confPath.endsWith('.js') || confPath.endsWith('.ts')) {
            const configModule = require(confPath);
            const reporterOptions = configModule.reporterOptions;
            Object.assign(opts, reporterOptions);
        }
    
        if (confPath.endsWith('.json')) {
            const configJSON = fs.readFileSync(confPath);
            const parsed = JSON.parse(configJSON);
            const reporterOptions = parsed.reporterOptions;
            Object.assign(opts, reporterOptions);
        }
    }

    // Override settings from config file
    if (options.project) opts.project = options.project;
    if (options.component) opts.component = options.component;
    if (options.directory) opts.outputDir = options.directory;
    if (options.source) opts.source = options.source;
    if (options.environment) opts.environment = options.environment;

    if (options.verbose)
        opts.verbose = true;

    opts.exportFile = options?.output ?? 'merged';

    if (!opts.outputDir) {
        process.stderr.write('ERR: Directory with test results wasn\'t set.\n');
        return null;
    }

    return opts;
}

program.action((options) => {
    const opts = validateOptions(options);
    if (opts === null)
        process.exit(1);               

    const dirPath = opts.outputDir;

    try {
        fs.accessSync(dirPath, fs.constants.R_OK);
    } catch (err) {
        process.stderr.write(
            `ERR: The directory '${opts.outputDir}' doesn't exist or permissions aren't set correctly.\n`
        );
        process.exit(1);
    }

    const stats = { tests: 0, failures: 0, skipped: 0 };
    const suites = [];
    const resultFiles = fs.readdirSync(dirPath).filter((file) => {
        return file.includes('tmp');
    });

    for (const file of resultFiles) {
        const data = fs.readFileSync(`${dirPath}/${file}`, 'utf8', (err, data) => {
            if (err) {
                process.stderr.write(`ERR: Cannot read contents of ${file}.\n`);
                process.exit(1);
            }

            return data;
        });

        const xmlDoc = convert.xml2json(data, { compact: true, spaces: 2 });
        let suite = JSON.parse(xmlDoc);

        for (const [key, value] of Object.entries(suite.testsuites)) {
            let file;
            if (key === '_attributes') {
                stats.tests += parseInt(value['tests']);
                stats.failures += parseInt(value['failures']);
                stats.skipped += parseInt(value['skipped']);
                continue;
            }
            for (const [k, v] of Object.entries(value)) {
                if (v['_attributes']['file'] != 'null') 
                    file = v['_attributes']['file'];
                else 
                    v['_attributes'].file = file;

                if (v['testcase']) 
                    suites.push({ ...v });
            }
        }
    }

    const source = opts.source ?? process.env.BUILD_TAG ?? process.env.RUNNER_TRACKING_ID ?? 'local';

    const propList = [
        { _attributes: { key: 'project', value: opts?.project ?? 'sample-project' } },
        { _attributes: { key: 'component', value: opts?.component ?? 'sample-component' } },
        { _attributes: { key: 'source', value: source } },
        { _attributes: { key: 'env', value: opts?.env ?? '' } },
    ];

    const propObj = {property: [...propList]}

    const rootSuite = {
        _attributes: { tests: stats.tests, failures: stats.failures, errors: 0, skipped: stats.skipped },
        properties: [propObj],
        testsuite: suites,
    };
    const out = { testsuites: [rootSuite] };

    const data = convert.json2xml(JSON.stringify(out), { compact: true, ignoreComment: true, spaces: 2 });
    
    if (opts.verbose) 
        console.log(data);
    
    try {
        fs.writeFileSync(`${dirPath}/${opts?.output ?? 'merged'}.ibutsu.xml`, data, 'utf-8');
    } catch (exc) {
        process.stderr.write('ERR: Cannot write results file.\n');
    }
});

program.parse(process.argv);
