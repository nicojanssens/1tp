'use strict'

var TurnTransport = require('../../index').transports.turn
var TurnProtocols = require('turn-js').transports

var LocalSignaling = require('../../index').signaling.local
var WebSocketSignaling = require('../../index').signaling.websocket

var chai = require('chai')
var expect = chai.expect
var merge = require('merge')

var turnAddr = process.env.TURN_ADDR
var turnPort = process.env.TURN_PORT
var turnUser = process.env.TURN_USER
var turnPwd = process.env.TURN_PASS
var registrar = process.env.ONETP_REGISTRAR

var defaultProtocolVersion = require('../../package.json').version

describe('1tp transports', function () {
  this.timeout(30000)

  it('should return echo messages using tcp+turn transport with local signaling and close receiving transport afterwards', function (done) {
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
    testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should return echo messages using tcp+turn transport with WS signaling and close receiving transport afterwards', function (done) {
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
    testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should correctly close TURN TCP stream by destroying client socket', function (done) {
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
    testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'client',
      done)
  })

  it('should correctly close TURN UDP stream by destroying client socket', function (done) {
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
    testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'client',
      done)
  })

  it('should correctly close TURN UDP stream by destroying server socket', function (done) {
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
    testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'server',
      done)
  })

  it('should correctly close TURN TCP stream by destroying server socket', function (done) {
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
    testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, 'server',
      done)
  })
})

function testEchoMessages (clientSpecs, serverSpecs, done) {
  var nbTestMessages = 10
  var currentTestMessage = 0

  var clientSocket = clientSpecs.socket
  var serverSocket = serverSpecs.socket
  var listeningInfo = serverSpecs.listeningInfo

  var clientReadStreamEnded = false
  var clientWriteStreamEnded = false
  var echoReadStreamEnded = false
  var echoWriteStreamEnded = false

  // when a new stream is generated
  serverSocket.on('connection', function (echoStream, connectionInfo) {
    console.log('echo stream available')
    expect(connectionInfo).to.not.be.undefined
    // then pipe the read stream to the write stream (echo behavior)
    echoStream.pipe(echoStream)
    // write stream end
    echoStream.on('finish', function () {
      console.log('echo write stream ended')
      echoWriteStreamEnded = true
    })
    // read stream end
    echoStream.on('end', function () {
      console.log('echo read stream ended')
      echoReadStreamEnded = true
    })
    // try to close server socket
    serverSocket.close(
      function () {
        console.log('closed')
        setTimeout(function () { // to cope with TCP closing behavior
          expect(clientReadStreamEnded).to.be.true
          expect(clientWriteStreamEnded).to.be.true
          expect(echoReadStreamEnded).to.be.true
          expect(echoWriteStreamEnded).to.be.true
          done()
        }, 500)
      },
      function (error) {
        done(error)
      })
  })

  function sendTestMessage (stream) {
    var testMessage = 'test message ' + currentTestMessage
    console.log('sending message ' + testMessage)
    stream.write(testMessage)
  }

  // bind echo socket
  serverSocket.listenP(listeningInfo)
    .then(function (connectionInfo) {
      if (listeningInfo) {
        var protocolVersion = {
          version: defaultProtocolVersion
        }
        expect(connectionInfo).to.deep.equal(merge(protocolVersion, listeningInfo))
      }
      return clientSocket.connectP(connectionInfo)
    })
    .then(function (clientStream) {
      console.log('client stream available')
      // verify incoming test messages
      clientStream.on('data', function (chunk) {
        var message = chunk.toString()
        console.log('receiving message ' + message)
        expect(message).to.equal('test message ' + currentTestMessage++)
        if (currentTestMessage !== nbTestMessages) {
          sendTestMessage(clientStream)
        } else {
          clientStream.end()
        }
      })
      clientStream.on('error', function (error) {
        done(error)
      })
      // read stream end
      clientStream.on('end', function () {
        console.log('client read stream ended')
        clientReadStreamEnded = true
      })
      // write stream end
      clientStream.on('finish', function () {
        console.log('client write stream ended')
        clientWriteStreamEnded = true
      })
      // send test messages
      sendTestMessage(clientStream)
    })
    .catch(function (error) {
      done(error)
    })
}

function testDestroyStream (clientSpecs, serverSpecs, streamToDestroy, done) {
  var clientSocket = clientSpecs.socket
  var serverSocket = serverSpecs.socket
  var listeningInfo = serverSpecs.listeningInfo

  var serverStream, clientStream
  var clientStreamClosed = false
  var echoStreamClosed = false

  // when a new stream is generated
  serverSocket.on('connection', function (echoStream, connectionInfo) {
    console.log('echo stream available')
    serverStream = echoStream
    echoStream.on('close', function () {
      echoStreamClosed = true
      if (echoStreamClosed && clientStreamClosed) {
        console.log('echoStreamClosed')
        done()
      }
    })
    if (!serverStream || !clientStream) {
      // serverStream or clientStream are missing -- don't do anything
      return
    }
    if (streamToDestroy === 'client') {
      clientStream.destroy()
    } else {
      serverStream.destroy()
    }
  })

  // bind echo socket
  serverSocket.listenP(listeningInfo)
    .then(function (connectionInfo) {
      if (listeningInfo) {
        var protocolVersion = {
          version: defaultProtocolVersion
        }
        expect(connectionInfo).to.deep.equal(merge(protocolVersion, listeningInfo))
      }
      return clientSocket.connectP(connectionInfo)
    })
    .then(function (sourceStream) {
      console.log('client stream available')
      clientStream = sourceStream
      sourceStream.on('data', function (chunk) {
        var errorMsg = 'not expecting data arrival'
        console.error(errorMsg)
        done(errorMsg)
      })
      sourceStream.on('error', function (error) {
        console.error(error)
        done(error)
      })
      sourceStream.on('close', function () {
        clientStreamClosed = true
        if (echoStreamClosed && clientStreamClosed) {
          console.log('clientStreamClosed')
          done()
        }
      })
      if (!serverStream || !clientStream) {
        // serverStream or clientStream are missing -- don't do anything
        return
      }
      if (streamToDestroy === 'client') {
        clientStream.destroy()
      } else {
        serverStream.destroy()
      }
    })
    .catch(function (error) {
      done(error)
    })
}
