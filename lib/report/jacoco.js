/*
 Copyright (c) 2012, Yahoo! Inc.  All rights reserved.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */

var path = require('path'),
    util = require('util'),
    os = require('os'),
    Report = require('./index'),
    FileWriter = require('../util/file-writer'),
    TreeSummarizer = require('../util/tree-summarizer'),
    utils = require('../object-utils');

/**
 * a `Report` implementation that produces a jacoco-style XML file that conforms to the
 * http://jacoco.sourceforge.net/xml/coverage-04.dtd DTD.
 *
 * Usage
 * -----
 *
 *      var report = require('istanbul').Report.create('jacoco');
 *
 * @class JacocoReport
 * @module report
 * @extends Report
 * @constructor
 * @param {Object} opts optional
 * @param {String} [opts.dir] the directory in which to the jacoco-coverage.xml will be written
 */
function JacocoReport(opts) {
    Report.call(this);
    opts = opts || {};
    this.projectRoot = process.cwd();
    this.dir = opts.dir || this.projectRoot;
    this.file = opts.file || this.getDefaultConfig().file;
    this.opts = opts;
}

JacocoReport.TYPE = 'jacoco';
util.inherits(JacocoReport, Report);

function asJavaPackage(node) {
    return node.displayShortName().
        replace(/\//g, '.').
        replace(/\\/g, '.').
        replace(/\.$/, '');
}

function asClassName(node) {
    /*jslint regexp: true */
    return node.fullPath().replace(/.*[\\\/]/, '');
}

function quote(thing) {
    return '"' + thing + '"';
}

function attr(n, v) {
    return ' ' + n + '=' + quote(v) + ' ';
}

function branchCoverageByLine(fileCoverage) {
    var branchMap = fileCoverage.branchMap,
        branches = fileCoverage.b,
        ret = {};
    Object.keys(branchMap).forEach(function (k) {
        var line = branchMap[k].line,
            branchData = branches[k];
        ret[line] = ret[line] || [];
        ret[line].push.apply(ret[line], branchData);
    });
    Object.keys(ret).forEach(function (k) {
        var dataArray = ret[k],
            covered = dataArray.filter(function (item) { return item > 0; }),
            coverage = covered.length / dataArray.length * 100;
        ret[k] = { covered: covered.length, total: dataArray.length, coverage: coverage };
    });
    return ret;
}

function methodCoverage(fileCoverage) {
    var fnMap = fileCoverage.fnMap,
        functions = fileCoverage.b,
        ret = {};

    Object.keys(fnMap).forEach(function (k) {
        var line = fnMap[k].line,
            functionData = functions[k];
 
        ret[line] = ret[line] || [];
        ret[line].push.apply(ret[line], functionData);
    });

    Object.keys(ret).forEach(function (k) {
        var dataArray = ret[k],
            covered = dataArray.filter(function (item) { return item > 0; }),
            coverage = covered.length / dataArray.length * 100;
        ret[k] = { covered: covered.length, total: dataArray.length, coverage: coverage };
    });
    return ret;
}


function addModuleStats(node, fileCoverage, writer, projectRoot) {
    fileCoverage = utils.incrementIgnoredTotals(fileCoverage);

    var metrics = node.metrics,
        branchByLine = branchCoverageByLine(fileCoverage),
        methodCoveragef = methodCoverage(fileCoverage),
        fnMap,
        lines;

    writer.println('\t\t<class' +
        attr('name', asClassName(node)) +
        '>');

    fnMap = fileCoverage.fnMap;

    // <counter type="INSTRUCTION"  missed="0"  covered="0" />
    // <counter type="LINE"  missed="-29"  covered="30" />
    // <counter type="COMPLEXITY"  missed=""  covered="0" />
    // <counter type="METHOD"  missed=""  covered="0" />

    // We want to output a <method /> tag for each method in this file/module

    var fnCoverage = function(fileCoverage, fnLine) {

        var fn = fileCoverage.fnMap[fnLine],
            startLine = fn.loc.start.line,
            startColumn = fn.loc.start.column;

        var methodStatementKey = Object.keys(fileCoverage.statementMap)
                .filter(function(key) {
                    var statement = fileCoverage.statementMap[key];

                    return statement.start.line == startLine
                });

        var methodStatement = fileCoverage.statementMap[methodStatementKey];
        
        if (!methodStatement) return;
        

        // Calculate line coverage / instruction coverage
        var totalLines = (methodStatement.end.line - methodStatement.start.line) + 1;
        var coveredLines = 0;
        var missedLines = 0;

        for(var index = methodStatement.start.line; index <= methodStatement.end.line; index++) {
            if (fileCoverage.l[index] === 1) {
                coveredLines++;
            } else {
                missedLines++;
            }
        }

        // Calculate Complexity
        // v(G) = B - D + 1

        // Where E is the number of edges and N the number of nodes. JaCoCo calculates cyclomatic complexity of a method with the following equivalent equation based on the number of branches (B) and the number of decision points (D):

        return {
            instruction: {
                missed: missedLines,
                covered: coveredLines
            },
            line: {
                missed: missedLines,
                covered: coveredLines,
            },
            complexity: {
                missed: 0,
                covered: 1,
            },
            method: {
                missed: (coveredLines < 1) ? 1 : 0,
                covered: (coveredLines > 0) ? 1: 0
            }
        }
    }


    Object.keys(fnMap).forEach(function (k, i) {
 
        var name = fnMap[k].name,
            line = fnMap[k].line,
            hits = fileCoverage.f[k]
            coverage = fnCoverage(fileCoverage, k)

        if (!coverage) return;

        console.log(coverage)

        if (i == 14) {
            process.exit()
        }

        writer.println(
            '\t\t\t<method' +
            attr('name', name) +
            attr('desc', '()V') + // Fake out a no-args void return
            attr('line', line) +
            '>'
        );



        writer.println('\t\t\t\t<counter' +
            attr('type' , 'INSTRUCTION') +
            attr('missed', coverage.instruction.missed) +
            attr('covered', coverage.instruction.covered) +
            '/>');
        writer.println('\t\t\t\t<counter' +
            attr('type' , 'LINE') +
            attr('missed',  coverage.line.missed)+
            attr('covered', coverage.line.covered) +
            '/>');
        writer.println('\t\t\t\t<counter' +
            attr('type' , 'COMPLEXITY') +
            attr('missed', coverage.complexity.missed) +
            attr('covered', coverage.complexity.covered) +
            '/>');
        writer.println('\t\t\t\t<counter' +
            attr('type' , 'METHOD') +
            attr('missed', coverage.method.missed) +
            attr('covered', coverage.method.coverage) +
            '/>');


        writer.println('\t\t\t</method>');

    });


    writer.println('\t\t<lines>');
    lines = fileCoverage.l;
    Object.keys(lines).forEach(function (k) {
        var str = '\t\t\t<line' +
            attr('number', k) +
            attr('hits', lines[k]),
            branchDetail = branchByLine[k];

        if (!branchDetail) {
            str += attr('branch', false);
        } else {
            str += attr('branch', true) +
                attr('condition-coverage', branchDetail.coverage +
                    '% (' + branchDetail.covered + '/' + branchDetail.total + ')');
        }
        writer.println(str + '/>');
    });
    writer.println('\t\t</lines>');

    writer.println('\t\t</class>');
}

function walk(node, collector, writer, level, projectRoot) {
    var metrics;
    if (level === 0) {
        metrics = node.metrics;
        writer.println('<?xml version="1.0" ?>');
        writer.println('<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.0//EN" "report.dtd">');
        writer.println('<report' +
            attr('name', projectRoot) +
            '>');

        // Fix this
        writer.println('\t<sessioninfo' +
            attr('id', os.hostname()) +
            attr('start', '%s') +
            attr('dump', '%s') +
            '/>');

    }
    if (node.packageMetrics) {
        metrics = node.packageMetrics;
        writer.println('\t<package' +
            attr('name', asJavaPackage(node)) +
            '>');
        node.children.filter(function (child) { return child.kind !== 'dir'; }).
            forEach(function (child) {
                addModuleStats(child, collector.fileCoverageFor(child.fullPath()), writer, projectRoot);
            });
        writer.println('\t</package>');
    }
    node.children.filter(function (child) { return child.kind === 'dir'; }).
        forEach(function (child) {
            walk(child, collector, writer, level + 1, projectRoot);
        });

    if (level === 0) {
        writer.println('</coverage>');
        writer.println('</report>');
    }
}

Report.mix(JacocoReport, {
    synopsis: function () {
        return 'XML coverage report that can be consumed by the jacoco tool';
    },
    getDefaultConfig: function () {
        return { file: 'jacoco-coverage.xml' };
    },
    writeReport: function (collector, sync) {
        var summarizer = new TreeSummarizer(),
            outputFile = path.join(this.dir, this.file),
            writer = this.opts.writer || new FileWriter(sync),
            projectRoot = this.projectRoot,
            that = this,
            startTime,
            endTime,
            tree,
            root;

        collector.files().forEach(function (key) {
            summarizer.addFileCoverageSummary(key, utils.summarizeFileCoverage(collector.fileCoverageFor(key)));
        });
        tree = summarizer.getTreeSummary();
        root = tree.root;
        startTime = Date.now();
        os = require('os')
        writer.on('done', function () { that.emit('done'); });
        writer.writeFile(outputFile, function (contentWriter) {
            walk(root, collector, contentWriter, 0, projectRoot);
            endtime = Date.now();
            writer.done();
        });
    }
});

module.exports = JacocoReport;
