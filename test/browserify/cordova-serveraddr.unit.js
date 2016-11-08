'use strict'

var cp = require('child_process')
var dgram = require('dgram')
var gulp = require('gulp')
var gulpfile = require('../../gulpfile')
var path = require('path')

var turnAddr = process.env.TURN_ADDR
var turnPort = process.env.TURN_PORT
var turnUser = process.env.TURN_USER
var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR
var testSocketPort = 23456

var modules = {
  'dgram': 'chrome-dgram',
  'net': 'chrome-net',
  'winston-debug': 'winston-browser',
  'wrtc': false
}

describe('net api', function () {
  this.timeout(80000)

  it('should launch 1tp server in cordova app and verify server address', function (done) {
    var child
    // create udp server listening to messages from chrome app
    var server = dgram.createSocket('udp4')
    server.on('error', function (error) {
      console.error(error)
      server.close()
      if (child) {
        child.kill()
        done(error)
      }
    })
    server.on('message', function (message) {
      console.log('receiving message ' + message)
      child.kill()
      if (message.toString() === 'done') {
        done()
      } else {
        done(message)
      }
    })
    server.on('listening', function () {
      var address = server.address()
      console.log('test socket listening at ' + address.address + ':' + address.port)
      // start gulp task
      gulp.start('build-cordova-server')
    })
    // build bundle.js
    gulp.task('build-cordova-server', function () {
      var destFile = 'bundle.js'
      var destFolder = './cordova-app/www/js'
      var entry = './server.js'
      var env = {
        testSocketPort: server.address().port,
        turnAddr: turnAddr,
        turnPort: turnPort,
        turnUser: turnUser,
        turnPwd: turnPwd,
        registrar: registrar
      }
      return gulpfile
        .bundle(entry, modules, destFile, destFolder, true, env)
        .on('end', onBundleReady)
        .on('error', function (error) {
          console.error(error)
          done(error)
        })
    })
    // launch chrome app
    function onBundleReady () {
      console.log('clean browserify build, launching cordova emulator -- please wait a few seconds')
      var options = {
        cwd: path.join(__dirname, './cordova-app'),
        maxBuffer: 1000 * 1024
      }
      child = cp.exec(path.join(__dirname, './cordova-app', 'start.sh'), options, function (err, stdout, stderr) {
        if (err) {
          done(err)
        }
      // console.log(stdout)
      })
    }
    // start udp server
    server.bind(testSocketPort)
  })
})
