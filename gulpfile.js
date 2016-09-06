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

var modules = {}
modules = {
  'dgram': 'chrome-dgram',
  'net': 'chrome-net',
  'winston': 'winston-browser'
}

gulp.task('browserify', browserifyTask)

function browserifyTask() {
  var destFile = argv.production? '1tp.min.js': '1tp.debug.js'
  var destFolder = path.join(__dirname, 'build')
  var entry = path.join(__dirname, 'index.js')
  return bundle(entry, modules, destFile, destFolder, argv.production)
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
