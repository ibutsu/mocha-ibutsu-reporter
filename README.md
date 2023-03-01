<!-- omit in toc -->
# Mocha Ibutsu reporter

Exports results from Cypress test run and merges them into a XML file, which can be uploaded to Ibutsu.

<!-- omit in toc -->
# Table of contents
- [Installation](#installation)
- [Usage](#usage)
  - [Generating test results](#generating-test-results)
    - [JS configuration](#js-configuration)
    - [TS configuration](#ts-configuration)
    - [JSON configuration](#json-configuration)
  - [Merging files](#merging-files)
    - [Options](#options)
    - [Example](#example)

# Installation

```shell script
npm install mocha-ibutsu-reporter
```

# Usage

## Generating test results

In your Cypress config file, set the `reporter` option to `mocha-ibutsu-reporter`. Files are by default
exported to `cypress/results/` directory and can be set by user using the `outputDir` option, the path
is **relative to the cypress config file**.

### JS configuration

```javascript
const { defineConfig } = require('cypress')

module.exports = defineConfig({
  reporter: 'mocha-ibutsu-reporter',
  reporterOptions: {
    project: 'my-project',
    component: 'my-component',
    outputDir: 'results/',
  },
})
```

### TS configuration

```javascript
import { defineConfig } from 'cypress'

export default defineConfig({
  reporter: 'mocha-ibutsu-reporter',
  reporterOptions: {
    project: 'my-project',
    component: 'my-component',
    outputDir: 'results/',
  },
})
```

### JSON configuration

```json
{
  "reporter": "mocha-ibutsu-reporter",
  "reporterOptions": {
    "project": "my-project",
    "component": "my-component",
    "outputDir": "cypress/results/"
  }
}
```

## Merging files

Results are merged using the `merge-results` command. If no output file is set, results are by default
exported to `.ibutsu.xml` file with UUIDv4 set as it's name, and can be found in the directory with
individual result files. Any options set in the cypress config file can be overriden by passing
options to the cli program.

### Options

| Option      | Shorthand | Description                     |
| ----------- | --------- | ------------------------------- |
| config      | c         | Cypress config file             |
| project     | p         | Name of the project             |
| component   | m         | Name of the component           |
| outputDir   | d         | Directory with tests results    |
| source      | s         | Source from which test is run   |
| environment | e         | Environment the test is run in  |
| output      | o         | Name of the merged file         |
| verbose     | v         | Print merged results to console |
| help        | h         | Prints usage of the command     |

### Example

```shell script
merge-results -c cypress.json -e local -o ~/results/exported_results.xml
```
