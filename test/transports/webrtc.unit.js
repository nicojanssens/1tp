'use strict'

var tests = require('./tests.js')
var WebRtcTransport = require('../../index').transports.webrtc

var LocalSignaling = require('../../index').signaling.local
var WebSocketSignaling = require('../../index').signaling.websocket

// var turnAddr = process.env.TURN_ADDR
// var turnPort = process.env.TURN_PORT
// var turnUser = process.env.TURN_USER
// var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR

if (!registrar) {
  throw new Error ('ONETP_REGISTRAR undefined -- giving up')
}

describe('webrtc transport', function () {
  this.timeout(30000)

  it('should return echo messages using local signaling', function (done) {
    var localSignaling = new LocalSignaling()
    var clientSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: localSignaling
    })
    var serverSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: localSignaling
    })
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should return echo messages using WS signaling', function (done) {
    var clientSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should correctly close after destroying client socket', function (done) {
    var clientSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'client',
      function (error) {
        done(error)
      }
    )
  })

  it('should correctly close after destroying server socket', function (done) {
    var clientSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'server',
      function (error) {
        done(error)
      }
    )
  })
})
