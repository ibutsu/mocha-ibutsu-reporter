var xml = require("xml");
var Base = require("mocha").reporters.Base;
var fs = require("fs");
var path = require("path");
var md5 = require("md5");
var mkdirp = require('mkdirp');

module.exports = MochaIbutsuReporter;

function removeANSI(text) {
  return text.replace(/\u001b[^m]*?m/g, "");
}

function setOptions(opts) {
  let options = opts ?? {};
  options = options?.reporterOptions ?? {};
  options.outputFile = "cypress/results/tmp-#.xml";
  return options;
}

function fullSuiteTitle(suite) {
  var parent = suite.parent;
  var title = [suite.title];

  while (parent) {
    if (parent.root && parent.title === "") {
      title.unshift(this._options.rootSuiteTitle);
    } else {
      title.unshift(parent.title);
    }
    parent = parent.parent;
  }

  return removeANSI(title.join(this._options.suiteTitleSeparatedBy));
}

function isInvalidSuite(suite) {
  return (
    (!suite.root && suite.title === "") ||
    (suite.tests.length === 0 && suite.suites.length === 0)
  );
}

function MochaIbutsuReporter(runner, options) {
  this._options = setOptions(options);
  this._runner = runner;
  this._generateSuiteTitle = fullSuiteTitle;

  var testsuites = [];

  function lastSuite() {
    return testsuites[testsuites.length - 1].testsuite;
  }

  function lastTestCase() {
    const testsuite = lastSuite();
    return testsuite[testsuite.length - 1];
  }

  // get functionality from the Base reporter
  Base.call(this, runner);

  // remove old results
  this._runner.on(
    "start",
    function () {
      if (fs.existsSync(this._options.outputFile)) {
        fs.unlinkSync(this._options.outputFile);
      }
    }.bind(this)
  );

  this._runner.on(
    "suite",
    function (suite) {
      if (!isInvalidSuite(suite)) {
        testsuites.push(this.getTestsuiteData(suite));
      }
    }.bind(this)
  );

  this._runner.on(
    "pass",
    function (test) {
      lastSuite().push(this.getTestcaseData(test));
    }.bind(this)
  );

  this._runner.on(
    "fail",
    function (test, err) {
      const testcaseData = this.getTestcaseData(test, err);
      if (
        testcaseData.testcase[0]._attr.name.includes("after each") ||
        testcaseData.testcase[0]._attr.name.includes("after all")
      ) {
        lastTestCase().testcase[0]._attr.failure = true;
        lastTestCase().testcase[0]._attr.error = true;
        lastTestCase().testcase[0]._attr.success = false;
        lastTestCase().testcase.push(testcaseData.testcase[1]);
      } else if (testcaseData.testcase[0]._attr.name.includes("before each")) {
        testcaseData.testcase[0]._attr.name =
          testcaseData.testcase[0]._attr.name.replace(
            '"before each" hook for "',
            ""
          );
        testcaseData.testcase[0]._attr.name =
          testcaseData.testcase[0]._attr.name.substring(
            0,
            testcaseData.testcase[0]._attr.name.length - 2
          );
        lastSuite().push(testcaseData);
      } else if (testcaseData.testcase[0]._attr.name.includes("before all")) {
        testcaseData.testcase[0]._attr.name =
          testcaseData.testcase[0]._attr.name.replace(
            '"before all" hook for "',
            ""
          );
        testcaseData.testcase[0]._attr.name =
          testcaseData.testcase[0]._attr.name.substring(
            0,
            testcaseData.testcase[0]._attr.name.length - 2
          );
        lastSuite().push(testcaseData);
      } else {
        lastSuite().push(testcaseData);
      }
    }.bind(this)
  );

  if (this._options.includePending) {
    this._runner.on(
      "pending",
      function (test) {
        var testcase = this.getTestcaseData(test);

        testcase.testcase.push({ skipped: null });
        lastSuite().push(testcase);
      }.bind(this)
    );
  }

  this._runner.on(
    "end",
    function () {
      this.flush(testsuites);
    }.bind(this)
  );
}

MochaIbutsuReporter.prototype.getTestsuiteData = function (suite) {
  var testSuite = {
    testsuite: [
      {
        _attr: {
          name: removeANSI(suite.title),
          tests: suite.tests.length,
          file: suite?.file ?? null,
          timestamp: new Date().toISOString().slice(0, -5),
        },
      },
    ],
  };

  return testSuite;
};

MochaIbutsuReporter.prototype.getTestcaseData = function (test, err) {
  var config = {
    testcase: [
      {
        _attr: {
          name: removeANSI(test.title),
          time: (test?.duration ?? 0) / 1000,
          failure: !!err,
          error: !!err,
          success: !err,
        },
      },
    ],
  };

  if (err) {
    var message;
    if (err.message && typeof err.message.toString === "function") {
      message = err.message + "";
    } else if (typeof err.inspect === "function") {
      message = err.inspect() + "";
    } else {
      message = "";
    }
    var failureMessage = err.stack || message;
    var failureElement = {
      _attr: {
        message: err.message || "",
        type: err.name || "",
      },
      _cdata: failureMessage,
    };

    config.testcase.push({ failure: failureElement });
  }
  return config;
};

MochaIbutsuReporter.prototype.flush = function (testsuites) {
  var xml = this.getXml(testsuites);

  this.writeXmlToDisk(xml, this._options.outputFile);

  if (this._options.toConsole === true) {
    console.log(xml); // eslint-disable-line no-console
  }
};

MochaIbutsuReporter.prototype.getXml = function (testsuites) {
  var totalSuitesTime = 0;
  var totalTests = 0;
  var stats = this._runner.stats;
  var hasProperties = !!this._options.properties;

  testsuites.forEach(function (suite) {
    var _suiteAttr = suite.testsuite[0]._attr;
    // properties are added before test cases so we want to make sure that we are grabbing test cases
    // at the correct index
    var _casesIndex = hasProperties ? 2 : 1;
    var _cases = suite.testsuite.slice(_casesIndex);

    _suiteAttr.failures = 0;
    _suiteAttr.time = 0;
    _suiteAttr.skipped = 0;

    _cases.forEach(function (testcase) {
      var lastNode = testcase.testcase[testcase.testcase.length - 1];

      _suiteAttr.skipped += Number("skipped" in lastNode);
      _suiteAttr.failures += Number("failure" in lastNode);
      _suiteAttr.time += testcase.testcase[0]._attr.time;
    });

    if (!_suiteAttr.skipped) {
      delete _suiteAttr.skipped;
    }

    totalSuitesTime += _suiteAttr.time;
    totalTests += _suiteAttr.tests;
  });

  var rootSuite = {
    _attr: {
      name: this._options.testsuitesTitle,
      time: totalSuitesTime,
      tests: totalTests,
      failures: stats.failures,
    },
  };

  if (stats.pending) {
    rootSuite._attr.skipped = stats.pending;
  }

  return xml(
    {
      testsuites: [rootSuite].concat(testsuites),
    },
    { declaration: true, indent: "  " }
  );
};

MochaIbutsuReporter.prototype.writeXmlToDisk = function (xml, filePath) {
  if (filePath) {
    filePath = filePath.replace('#', md5(xml));

    mkdirp.sync(path.dirname(filePath));

    try {
      fs.writeFileSync(filePath, xml, "utf-8");
    } catch (exc) {
      process.stderr.write("Error occurred when trying to export results.\n");
    }
  }
};
