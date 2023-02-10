const fs = require("fs");
const path = require("path");
const convert = require('xml-js');
const xml = require('xml');

module.exports = Merge;

function getOptions()
{
    const options = {};
    const args = process.argv.slice(2);
    const file = args[0];
    const typeOfFile = file.split(".").at(-1);
    if (!["json", "js"].includes(typeOfFile))
    {
        process.stderr.write("Invalid config file.\n");
        return null;
    }

    if (typeOfFile == "json")
    {
        let data = fs.readFileSync(file, "utf8", (err, data) => {
            if (err)
            {
                process.stderr.write("Error occurred when trying to read file contents.\n");
                return null;
            }

            return data;
        })

        data = JSON.parse(data);

        const reporterOptions = data?.reporterOptions;

        options.project = reporterOptions?.testsuitesTitle;
        const fileDir = path.dirname(reporterOptions.outputFile);
        const rootDir = path.dirname(file);
        options.path = path.join(rootDir, fileDir);
    }
    else
    {
        //
    }

    return options;
}

function Merge()
{
    this._options = getOptions();
    if (this._options == null)
        return;
    
    if (!this.generateReportFile())
        return;

    this.bundle();
}

Merge.prototype.bundle = function () {
    const stats = {tests: 0, failures: 0};
    const suites = [];
    const files = fs.readdirSync(this._options.path).filter((file) => {
        return file.includes("tmp")
    });

    for (const file of files) {
        const data = fs.readFileSync(`${this._options.path}/${file}`, "utf8", (err, data) => {
            if (err)
            {
                process.stderr.write("Error occurred when trying to read file contents.\n");
                return null;
            }
            
            return data;
        });

        const xmlDoc = convert.xml2json(data, {compact: true, spaces: 4});
        let suite = JSON.parse(xmlDoc);

        for (const [key, value] of Object.entries(suite.testsuites)) {
            let file;
            if (key === "_attributes")
            {
                stats.tests += parseInt(value["tests"]);
                stats.failures += parseInt(value["failures"]);
                continue;
            }
            for (const [k, v] of Object.entries(value)) {
                if (v["_attributes"]["file"] != "null")
                    file = v["_attributes"]["file"]
                else
                    v["_attributes"].file = file;

                if (v["testcase"])
                    suites.push({testsuite: {...v}});
            }
        }
    }

    const rootSuite = {_attributes: {tests: stats.tests, failures: stats.failures, errors: 0, skipped: 0}, ...suites};
    const out = {testsuites: [rootSuite]};

    console.log(out);

    const data = convert.json2xml(JSON.stringify(out), {compact: true, ignoreComment: true, spaces: 4}, ...suites)

    try {
    fs.writeFileSync(`${this._options.path}/merged.xml`, data, "utf-8");
    } catch (exc) {
    process.stderr.write("Error occurred when trying to export results.\n");
    }

};

Merge.prototype.generateReportFile = function () {
    const report = {"metadata": {"project": this._options.project}};
    const data = JSON.stringify(report);
    const filename = this._options.path + "/run.json";
    try {
        fs.writeFileSync(filename, data);
        return true;
    } catch (exc) {
        process.stderr.write("Error occurred when trying to export report file.\n");
        process.stderr.write(exc);
        return false;
    }
};

new Merge();
