'use strict'

var duplexify = require('duplexify')
var PassThrough = require('stream').PassThrough
var ProxyStream = require('../../lib/stream')
var signalingFactory = require('../../lib/signaling/in-band/factory')
var Transform = require('stream').Transform
var util = require('util')

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

  it('should correctly execute handshake between two streams', function (done) {
    var serverStreamReady = false
    // create client proxy
    var clientStream = new ProxyStream()
    // create server proxy
    var serverStream = new ProxyStream()
    // create connector streams
    var downStreamPipe = new FiteringPassThrough()
    var upStreamPipe = new FiteringPassThrough()
    var clientConnector = duplexify(downStreamPipe, upStreamPipe)
    var serverConnector = duplexify(upStreamPipe, downStreamPipe)
    // connect client and server streams
    clientStream.connectStream(clientConnector)
    serverStream.connectStream(serverConnector)
    // init handshake
    serverStream._waitForHandshakeP()
      .then(function (connected) {
        expect(connected).to.be.true
        serverStreamReady = true
      })
    clientStream._initHandshakeP()
      .then(function () {
        expect(serverStreamReady).to.be.true
        done()
      })
    // complain when other events are fired
    clientStream.on('data', function () {
      done("client stream should not receive DATA event")
    })
    clientStream.on('end', function () {
      done("client stream should not receive END event")
    })
    clientStream.on('finish', function () {
      done("client stream should not receive FINISH event")
    })
    clientStream.on('close', function () {
      done("client stream should not receive CLOSE event")
    })
    clientStream.on('error', function (error) {
      done(error)
    })
    serverStream.on('data', function () {
      done("server stream should not receive DATA event")
    })
    serverStream.on('end', function () {
      done("server stream should not receive END event")
    })
    serverStream.on('finish', function () {
      done("server stream should not receive FINISH event")
    })
    serverStream.on('close', function () {
      done("server stream should not receive CLOSE event")
    })
    serverStream.on('error', function (error) {
      done(error)
    })
  })

  it('should correctly handle PING losses while executing a handshake between two streams', function (done) {
    // create client proxy
    var clientStream = new ProxyStream()
    // create server proxy
    var serverStream = new ProxyStream()
    // create connector streams
    var downStreamPipe = new FiteringPassThrough()
    downStreamPipe.dropMessage(signalingFactory.MESSAGE.PING)
    var upStreamPipe = new FiteringPassThrough()
    var clientConnector = duplexify(downStreamPipe, upStreamPipe)
    var serverConnector = duplexify(upStreamPipe, downStreamPipe)
    // connect client and server streams
    clientStream.connectStream(clientConnector)
    serverStream.connectStream(serverConnector)
    // init handshake
    serverStream._waitForHandshakeP()
      .then(function (connected) {
        expect(connected).to.be.true
      })
    clientStream._initHandshakeP()
      .then(function () {
        done("client stream should not succeed in handshake participation")
      })
      .catch(function (error) {
        expect(error).to.not.be.undefined
        done()
      })
    // complain when other events are fired
    clientStream.on('data', function () {
      done("client stream should not receive DATA event")
    })
    clientStream.on('end', function () {
      done("client stream should not receive END event")
    })
    clientStream.on('finish', function () {
      done("client stream should not receive FINISH event")
    })
    clientStream.on('close', function () {
      done("client stream should not receive CLOSE event")
    })
    clientStream.on('error', function (error) {
      done(error)
    })
    serverStream.on('data', function () {
      done("server stream should not receive DATA event")
    })
    serverStream.on('end', function () {
      done("server stream should not receive END event")
    })
    serverStream.on('finish', function () {
      done("server stream should not receive FINISH event")
    })
    serverStream.on('close', function () {
      done("server stream should not receive CLOSE event")
    })
    serverStream.on('error', function (error) {
      done(error)
    })
  })

  it('should correctly handle PONG losses while executing a handshake between two streams', function (done) {
    var serverStreamReady = false
    // create client proxy
    var clientStream = new ProxyStream()
    // create server proxy
    var serverStream = new ProxyStream()
    // create connector streams
    var downStreamPipe = new FiteringPassThrough()
    var upStreamPipe = new FiteringPassThrough()
    upStreamPipe.dropMessage(signalingFactory.MESSAGE.PONG)
    var clientConnector = duplexify(downStreamPipe, upStreamPipe)
    var serverConnector = duplexify(upStreamPipe, downStreamPipe)
    // connect client and server streams
    clientStream.connectStream(clientConnector)
    serverStream.connectStream(serverConnector)
    // init handshake
    serverStream._waitForHandshakeP()
      .then(function (connected) {
        expect(connected).to.be.true
        serverStreamReady = true
      })
    clientStream._initHandshakeP()
      .then(function () {
        done("client stream should not succeed in handshake participation")
      })
      .catch(function (error) {
        expect(error).to.not.be.undefined
        done()
      })
    // complain when other events are fired
    clientStream.on('data', function () {
      done("client stream should not receive DATA event")
    })
    clientStream.on('end', function () {
      done("client stream should not receive END event")
    })
    clientStream.on('finish', function () {
      done("client stream should not receive FINISH event")
    })
    clientStream.on('close', function () {
      done("client stream should not receive CLOSE event")
    })
    clientStream.on('error', function (error) {
      done(error)
    })
    serverStream.on('data', function () {
      done("server stream should not receive DATA event")
    })
    serverStream.on('end', function () {
      done("server stream should not receive END event")
    })
    serverStream.on('finish', function () {
      done("server stream should not receive FINISH event")
    })
    serverStream.on('close', function () {
      done("server stream should not receive CLOSE event")
    })
    serverStream.on('error', function (error) {
      done(error)
    })
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

function FiteringPassThrough (options) {
  if (!(this instanceof FiteringPassThrough)) {
    return new FiteringPassThrough(options)
  }
  Transform.call(this, options)
  // init
  this.filter = function () {
    // drop no messages
    return false
  }
}

util.inherits(FiteringPassThrough, Transform)

FiteringPassThrough.prototype._transform = function(bytes, encoding, cb) {
  var packet = signalingFactory.parseSocketPacket(bytes)
  // if message type needs to be filtered
  if (this.filter(packet)) {
    // ignore packet
    console.log('FiteringPassThrough -- IGNORING message ' + packet.type)
    cb()
    return
  }
  // else proceed
  var self = this
  process.nextTick(function () {
    // console.log('FiteringPassThrough -- PROCESSING message ' + packet.type)
    self.push(bytes)
    cb()
  })
}

FiteringPassThrough.prototype.dropMessage = function (packetType) {
  this.filter = function (packet) {
    if (packet.type === packetType) {
      return true
    }
  }
}
