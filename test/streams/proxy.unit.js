'use strict'

var PassThrough = require('stream').PassThrough
var ProxyStream = require('../../lib/stream')

var chai = require('chai')
var expect = chai.expect

describe('Testing proxy stream', function () {
  this.timeout(10000)

  it('should return echo messages and end stream', function (done) {
    var nbTestMessages = 10
    var currentTestMessage = 0
    var proxyReadStreamEnded, proxyWriteStreamEnded = false
    // create proxy
    var proxy = new ProxyStream()
    // create passthrough
    var passThrough = new PassThrough()
    // connect passthrough to proxy
    proxy.connectStream(passThrough)
    // send test messages
    proxy.on('data', function (chunk) {
      console.log(chunk.toString())
      expect(chunk.toString()).to.equal('test message ' + currentTestMessage++)
      if (currentTestMessage === nbTestMessages) {
        proxy.end()
      }
    })
    // read stream end
    proxy.on('end', function () {
      console.log('proxy read stream ended')
      // check if echo write stream has ended
      expect(proxyWriteStreamEnded).to.be.true
      proxyReadStreamEnded = true
      done()
    })
    // write stream end
    proxy.on('finish', function () {
      console.log('proxy write stream ended')
      proxyWriteStreamEnded = true
    })
    // write test messages
    for (var i = 0; i < nbTestMessages; i++) {
      var testMessage = 'test message ' + i
      proxy.write(testMessage)
    }
  })

  it('should correctly process setTimeout requests', function (done) {
    var nbTestMessages = 10
    var currentTestMessage = 0
    var proxyReadStreamEnded, proxyWriteStreamEnded = false
    // create proxy
    var proxy = new ProxyStream()
    // create passthrough
    var passThrough = new PassThrough()
    // connect passthrough to proxy
    proxy.connectStream(passThrough)
    // timeout stuff
    proxy.on('timeout', function () {
      console.log('timeout')
      if (currentTestMessage === nbTestMessages) {
        proxy.end()
      } else {
        var errorMsg = 'received timeout event before receiving all messages'
        done(errorMsg)
      }
    })
    proxy.setTimeout(1000)
    // print out incoming messages
    proxy.on('data', function (chunk) {
      console.log(chunk.toString())
      expect(chunk.toString()).to.equal('test message ' + currentTestMessage++)
      if (currentTestMessage === nbTestMessages) {
        clearInterval(timeout)
      }
    })
    // read stream end
    proxy.on('end', function () {
      console.log('proxy read stream ended')
      // check if echo write stream has ended
      expect(proxyWriteStreamEnded).to.be.true
      proxyReadStreamEnded = true
      done()
    })
    // write stream end
      proxy.on('finish', function () {
      console.log('proxy write stream ended')
      proxyWriteStreamEnded = true
    })
    // write test messages
    var i = 0
    var timeout = setInterval(function () {
      var testMessage = 'test message ' + i++
      proxy.write(testMessage)
    }, 500)
  })
})
