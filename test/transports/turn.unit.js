'use strict'

var tests = require('./tests.js')
var TurnTransport = require('../../index').transports.turn
var TurnProtocols = require('turn-js').transports

var LocalSignaling = require('../../index').signaling.local
var WebSocketSignaling = require('../../index').signaling.websocket
var FilteringWebSocketSignaling = require('./filters/ws-signaling')

var chai = require('chai')
var expect = chai.expect

var turnAddr = process.env.TURN_ADDR
var turnPort = process.env.TURN_PORT
var turnUser = process.env.TURN_USER
var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR

if (!turnAddr) {
  throw new Error('TURN_ADDR undefined -- giving up')
}
if (!turnPort) {
  throw new Error('TURN_PORT undefined -- giving up')
}
if (!turnUser) {
  throw new Error('TURN_USER undefined -- giving up')
}
if (!turnPwd) {
  throw new Error('TURN_PASS undefined -- giving up')
}
if (!registrar) {
  throw new Error('ONETP_REGISTRAR undefined -- giving up')
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
    },
      function (clientStream, serverStream) {
        expect(clientStream.readable).to.be.false
        expect(clientStream.writable).to.be.false
        expect(serverStream.readable).to.be.false
        expect(serverStream.writable).to.be.false
        done()
      },
      function (error) {
        done(error)
      }
    )
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
    },
      function (clientStream, serverStream) {
        expect(clientStream.readable).to.be.false
        expect(clientStream.writable).to.be.false
        expect(serverStream.readable).to.be.false
        expect(serverStream.writable).to.be.false
        done()
      },
      function (error) {
        done(error)
      }
    )
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
    },
      'client',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
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
    },
      'client',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
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
    },
      'server',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
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
    },
      'server',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
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

  it('should correctly abort handshake -- case 1', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({uid: 'foo', url: registrar}),
      connectTimeout: 2000
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
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        return clientSocket.abortP(connectionInfo)
      })
      .then(function () {
        var errorMsg = 'extecting abort function to fail'
        done(errorMsg)
      })
      .catch(function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.include('cannot find session info')
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        done()
      })
  })

  it('should correctly abort handshake -- case 2', function (done) {
    var filteringWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'foo',
      url: registrar
    })
    filteringWebSocketSignaling.filter = function () {
      // drop all messages
      return true
    }
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringWebSocketSignaling,
      connectTimeout: 2000
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
      })
    setTimeout(function () {
      clientSocket.abortP(connectionInfo)
        .then(function () {
          expect(Object.keys(clientSocket._sessions).length).to.equal(0)
          done()
        })
        .catch(function (error) {
          done(error)
        })
    }, 1000)
  })

  it('should correctly abort handshake -- case 3', function (done) {
    var filteringWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'foo',
      url: registrar
    })
    filteringWebSocketSignaling.filter = function () {
      // drop all messages
      return true
    }
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringWebSocketSignaling,
      connectTimeout: 2000
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
      })
    clientSocket.abortP(connectionInfo)
      .then(function () {
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        setTimeout(done, 3000)
      })
      .catch(function (error) {
        done(error)
      })
  })

  it('should correctly abort handshake -- case 4', function (done) {
    var filteringClientWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'wallace',
      url: registrar
    })
    var filteringServerWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'gromit',
      url: registrar
    })
    filteringServerWebSocketSignaling.filter = function (message) {
      if (message.operationType === 'ready') {
        return true
      } else {
        return false
      }
    }
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringClientWebSocketSignaling
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringServerWebSocketSignaling
    })
    // execute abort test
    tests.testAbortStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 100,
    // on success
    function () {
      expect(Object.keys(clientSocket._sessions).length).to.equal(0)
      setTimeout(function () {
        expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        done()
      }, clientSocket._args.connectTimeout + 500)
    }, done)
  })

  it('should correctly cope with dropped CONNECT messages', function (done) {
    var filteringClientWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'alpha',
      url: registrar
    })
    var filteringServerWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'beta',
      url: registrar
    })
    filteringClientWebSocketSignaling.filter = function (message) {
      if (message.operationType === 'connect') {
        return true
      } else {
        return false
      }
    }
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringClientWebSocketSignaling
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringServerWebSocketSignaling
    })
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    },
      function (clientStream, serverStream) {
        done("don't expect connection establishment")
      },
      function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('handshake aborted')
        // // test if there are no more sessions left
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        done()
      }
    )
  })

  it('should correctly cope with dropped READY messages', function (done) {
    var filteringClientWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'alpha',
      url: registrar
    })
    var filteringServerWebSocketSignaling = new FilteringWebSocketSignaling({
      uid: 'beta',
      url: registrar
    })
    filteringServerWebSocketSignaling.filter = function (message) {
      if (message.operationType === 'ready') {
        return true
      } else {
        return false
      }
    }
    var clientSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringClientWebSocketSignaling
    })
    var serverSocket = new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: filteringServerWebSocketSignaling
    })
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    },
      function (clientStream, serverStream) {
        done("don't expect connection establishment")
      },
      function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('handshake aborted')
        // test if there are no more client sessions left
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        // test if there are no more server sessions left
        setTimeout(function () {
          expect(Object.keys(serverSocket._sessions).length).to.equal(0)
          done()
        }, 1000)
      }
    )
  })


})
