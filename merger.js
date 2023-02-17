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
        .requiredOption('-p, --project <string>', 'Name of the project')
        .requiredOption('-c, --component <string>', 'Component being tested')
        .requiredOption('-d, --directory <path>', 'Path to the directory with results')
        .option('-s, --source', 'Source from which test is run')
        .option('-e, --environment', 'Environment the test is run in')
        .option('-v, --verbose', 'Output the merged results to console');

    return program;
}

const program = getProgram();

program.action((options) => {
    const dirPath = options.directory; // TODO: handle relative paths

    try {
        fs.accessSync(dirPath, fs.constants.R_OK);
    } catch (err) {
        process.stderr.write(
            `ERR: The directory '${options.directory}' doesn't exist or permissions aren't set correctly.\n`
        );
        process.exit(1);
    }

    const stats = { tests: 0, failures: 0 };
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

    const source = options.source ?? process.env.BUILD_TAG ?? process.env.RUNNER_TRACKING_ID ?? 'local';

    const propList = [
        { _attributes: { key: 'project', value: options.project } },
        { _attributes: { key: 'component', value: options.component } },
        { _attributes: { key: 'source', value: source } },
        { _attributes: { key: 'env', value: options.env ?? '' } },
    ];

    const propObj = {property: [...propList]}

    const rootSuite = {
        _attributes: { tests: stats.tests, failures: stats.failures, errors: 0, skipped: 0 },
        properties: [propObj],
        testsuite: suites,
    };
    const out = { testsuites: [rootSuite] };

    const data = convert.json2xml(JSON.stringify(out), { compact: true, ignoreComment: true, spaces: 4 });
    
    if (options.verbose) 
        console.log(data);
    
    try {
        fs.writeFileSync(`${dirPath}/merged.xml`, data, 'utf-8');
    } catch (exc) {
        process.stderr.write('ERR: Cannot write results file.\n');
    }
});

program.parse(process.argv);
