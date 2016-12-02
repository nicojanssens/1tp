'use strict'

var tests = require('./tests.js')
var TurnTransport = require('../../index').transports.turn
var TurnProtocols = require('turn-js').transports

var LocalSignaling = require('../../index').signaling.local
var WebSocketSignaling = require('../../index').signaling.websocket

var chai = require('chai')
var expect = chai.expect

var turnAddr = process.env.TURN_ADDR
var turnPort = process.env.TURN_PORT
var turnUser = process.env.TURN_USER
var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR

if (!turnAddr) {
  throw new Error ('TURN_ADDR undefined -- giving up')
}
if (!turnPort) {
  throw new Error ('TURN_PORT undefined -- giving up')
}
if (!turnUser) {
  throw new Error ('TURN_USER undefined -- giving up')
}
if (!turnPwd) {
  throw new Error ('TURN_PASS undefined -- giving up')
}
if (!registrar) {
  throw new Error ('ONETP_REGISTRAR undefined -- giving up')
}

describe('turn transport', function () {
  this.timeout(10000)

  it('should return echo messages using tcp transport with local signaling and close receiving transport afterwards', function (done) {
    var localSignaling = new LocalSignaling()
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: localSignaling
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: localSignaling
    })
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should return echo messages using tcp transport with WS signaling and close receiving transport afterwards', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({url: registrar})
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({url: registrar})
    })
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should correctly close turn+tcp stream after destroying client socket', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'client',
      done)
  })

  it('should correctly close turn+udp stream after destroying client socket', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'client',
      done)
  })

  it('should correctly close turn+udp stream after destroying server socket', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'server',
      done)
  })

  it('should correctly close turn+tcp stream after destroying server socket', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar})
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'tdelaet', url: registrar})
    })
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'server',
      done)
  })

  it('should correctly deal with a handshake timeout', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'nicoj', url: registrar}),
      connectTimeout: 1000
    })
    var connectionInfo = {
      transportType: 'turn-tcp',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'bar',
        url: registrar
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
        done()
      })
  })

})
