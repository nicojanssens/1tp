'use strict'

var chrome = require('./chrome')
var dgram = require('dgram')
var gulp = require('gulp')
var gulpfile = require('../../gulpfile')
var net = require('../../lib/net')

var onetpTransports = require('../../lib/transports')
var TcpTransport = onetpTransports.tcp
var UdpTransport = onetpTransports.udp
var TurnTransport = onetpTransports.turn
var WebRtcTransport = onetpTransports.webrtc
var TurnProtocols = require('turn-js').transports
var WebSocketSignaling = require('../../lib/signaling').websocket

var turnAddr = process.env.TURN_ADDR
var turnPort = process.env.TURN_PORT
var turnUser = process.env.TURN_USER
var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR
var testSocketPort = 23456

var winston = require('winston')
winston.level = 'debug'

var modules  = {
  'dgram': 'chrome-dgram',
  'net': 'chrome-net',
  'winston': 'winston-browser',
  'wrtc': false
}

describe('net api', function () {
  this.timeout(50000)

  it('should establish connection with 1tp client in chrome app', function (done) {
    var child
    var onetpServerAddress
    // create 1tp server
    var server = net.createServer(function (connection) {
      console.log('connection established')
      connection.on('data', function (data) {
        console.log('received message ' + data)
        switch (data.toString()) {
          case 'hello':
            connection.write('world')
            break
          case 'done':
            child.kill()
            done()
            break
          default:
            var errorMsg = "don't know how to process message " + data
            done(errorMsg)
        }
      })
    })
    // start 1tp server
    server.listen(function () {
      onetpServerAddress = server.address()
      console.log('1tp server listening at ' + JSON.stringify(onetpServerAddress))
      // start gulp task
      gulp.start('build-chrome-client')
    })
    // build bundle.js
    gulp.task('build-chrome-client', function () {
      var destFile = 'bundle.js'
      var destFolder = './chrome-app'
      var entry = './client.js'
      var env = {
        onetpServerAddress: onetpServerAddress,
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
      console.log('clean browserify build, launching chrome app')
      child = chrome.launchApp()
    }
  })

  it('should launch 1tp server in chrome app and verify server address', function (done) {
    var child
    // create udp server listening to messages from chrome app
    var server = dgram.createSocket('udp4')
    server.on('error',  function (error) {
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
        done(new Error(message))
      }
    })
    server.on('listening', function () {
      var address = server.address()
      console.log('test socket listening at ' + address.address + ':' + address.port)
      // start gulp task
      gulp.start('build-chrome-server')
    })
    // build bundle.js
    gulp.task('build-chrome-server', function () {
      var destFile = 'bundle.js'
      var destFolder = './chrome-app'
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
      console.log('clean browserify build, launching chrome app')
      child = chrome.launchApp()
    }
    // start udp server
    server.bind(testSocketPort)
  })
})
