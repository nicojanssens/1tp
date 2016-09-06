'use strict'

var argv = require('yargs').argv
var babelify = require('babelify')
var browserify = require('browserify')
var buffer = require('vinyl-buffer')
var envify = require('envify/custom')
var gulp = require('gulp')
var gulpif = require('gulp-if')
var path = require('path')
var size = require('gulp-size')
var source = require('vinyl-source-stream')
var uglify = require('gulp-uglify')

var chromeModules = {}
chromeModules = {
  'dgram': 'chrome-dgram',
  'net': 'chrome-net',
  'nicAddresses': './lib/transports/addresses/nic-chrome',
  'winston': 'winston-browser'
}
var cordovaModules = {}
cordovaModules = {
  'dgram': 'chrome-dgram',
  'net': 'chrome-net',
  'nicAddresses': './lib/transports/addresses/nic-cordova',
  'winston': 'winston-browser'
}

gulp.task('chromiumify', chromiumifyTask)
gulp.task('cordovaify', cordovaifyTask)

function chromiumifyTask() {
  var destFile = argv.production? '1tp.min.js': '1tp.debug.js'
  var destFolder = path.join(__dirname, 'build/chromium')
  var entry = path.join(__dirname, 'index.js')
  return bundle(entry, chromeModules, destFile, destFolder, argv.production)
}
function cordovaifyTask() {
  var destFile = argv.production? '1tp.min.js': '1tp.debug.js'
  var destFolder = path.join(__dirname, 'build/cordova')
  var entry = path.join(__dirname, 'index.js')
  return bundle(entry, cordovaModules, destFile, destFolder, argv.production)
}

function bundle(entry, replacements, destFile, destFolder, production, env) {
  // check if env is defined
  env = (env === undefined)? {}: env
  // set browserify options
  var options = {
    entries: entry,
    extensions: ['.js'],
    debug: production ? false : true
  }
  // create bundler
  var bundler = browserify(options)
  // replace libs
  for (var originalModule in replacements) {
    var replacementModule = replacements[originalModule]
    bundler = bundler.require(replacementModule, {
       expose: originalModule
    })
  }
  // babelify transformation
  bundler.transform(
    babelify, {
      global: true,
      presets: ['es2015']
    }
  )
  // envify transformation
  bundler.transform(
    envify(env), {
      global: true
    }
  )
  // bundle
  return bundler.bundle()
    .on('error', function (err) {
      console.log(err.toString());
      this.emit('end');
    })
    .pipe(source(destFile))
    .pipe(gulpif(argv.production, buffer()))
    .pipe(gulpif(argv.production, uglify()))
    .pipe(gulpif(argv.production, size()))
    .pipe(gulp.dest(destFolder))
}

module.exports.bundle = bundle
