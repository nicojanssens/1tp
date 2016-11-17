'use strict'

var NetStringStream = require('../../lib/transports/session/netstring')
var through = require('through2')

var chai = require('chai')
var expect = chai.expect

describe('Testing netstring stream', function () {
  this.timeout(2000)

  it('should return echo messages and end stream', function (done) {
    var nbTestMessages = 10
    var currentTestMessage = 0
    // create streams
    var netStringStream = new NetStringStream()
    var passThrough = through()
    // glue them together
    netStringStream.attachToEncoder(passThrough)
    netStringStream.attachToDecoder(passThrough)
    // send test messages
    netStringStream.on('data', function (chunk) {
      console.log(chunk.toString())
      expect(chunk.toString()).to.equal('test message ' + currentTestMessage++)
      if (currentTestMessage === nbTestMessages) {
        netStringStream.end()
      }
    })
    netStringStream.on('end', function () {
      console.log('the end')
      done()
    })
    netStringStream.on('close', function () {
      var errorMsg = 'stream should not receive close event'
      done(errorMsg)
    })
    netStringStream.on('finish', function () {
      // do nothing
    })
    // write test messages
    for (var i = 0; i < nbTestMessages; i++) {
      var testMessage = 'test message ' + i
      netStringStream.write(testMessage)
    }
  })

  it('should return echo messages and destroy stream', function (done) {
    var nbTestMessages = 10
    var currentTestMessage = 0
    // create streams
    var netStringStream = new NetStringStream()
    var passThrough = through()
    // glue them together
    netStringStream.attachToEncoder(passThrough)
    netStringStream.attachToDecoder(passThrough)
    // send test messages
    netStringStream.on('data', function (chunk) {
      console.log(chunk.toString())
      expect(chunk.toString()).to.equal('test message ' + currentTestMessage++)
      if (currentTestMessage === nbTestMessages) {
        netStringStream.destroy()
      }
    })
    netStringStream.on('end', function () {
      var errorMsg = 'stream should not receive end event'
      done(errorMsg)
    })
    netStringStream.on('close', function () {
      console.log('the end')
      done()
    })
    netStringStream.on('finish', function () {
      var errorMsg = 'stream should not receive finished event'
      done(errorMsg)
    })
    // write test messages
    for (var i = 0; i < nbTestMessages; i++) {
      var testMessage = 'test message ' + i
      netStringStream.write(testMessage)
    }
  })
})
