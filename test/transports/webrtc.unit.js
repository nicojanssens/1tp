'use strict'

var tests = require('./tests.js')
var WebRtcTransport = require('../../index').transports.webrtc

var LocalSignaling = require('../../index').signaling.local
var WebSocketSignaling = require('../../index').signaling.websocket

var chai = require('chai')
var expect = chai.expect

// var turnAddr = process.env.TURN_ADDR
// var turnPort = process.env.TURN_PORT
// var turnUser = process.env.TURN_USER
// var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR

if (!registrar) {
  throw new Error ('ONETP_REGISTRAR undefined -- giving up')
}

describe('webrtc transport', function () {
  this.timeout(10000)

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

  it('should correctly deal with a handshake timeout', function (done) {
    var clientSocket = new WebRtcTransport({
      config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
      signaling: new WebSocketSignaling({uid: 'foo', url: registrar}),
      connectTimeout: 1000
    })
    var connectionInfo = {
      transportType: 'webrtc',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'bar',
        url: 'http://1tp-registrar.microminion.io/'
      }
    }
    clientSocket.connectP(connectionInfo)
      .then(function (stream) {
        var errorMsg = 'not expecting to receive connected stream ' + stream
        done(errorMsg)
      })
      .catch(function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('handshake aborted')
        // test if there are no more sessions left
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        expect(Object.keys(clientSocket._connectingPeers).length).to.equal(0)
        done()
      })
  })
})
