'use strict'

var TcpTransport = require('../src/transports').tcp
var TurnTransport = require('../src/transports').turn
var UdpTransport = require('../src/transports').udp

var TurnProtocols = require('turn-js').transports

var LocalSignaling = require('../src/signaling').local
var WebSocketSignaling = require('../src/signaling').websocket

var chai = require('chai')
var expect = chai.expect

var argv = require('yargs')
  .usage('Usage: $0 [params]')
  .demand('a')
  .alias('a', 'addr')
  .nargs('a', 1)
  .describe('a', 'TURN server address')
  .demand('p')
  .alias('p', 'port')
  .nargs('p', 1)
  .describe('p', 'TURN server port')
  .demand('u')
  .alias('u', 'user')
  .nargs('u', 1)
  .describe('u', 'TURN server user account')
  .demand('w')
  .alias('w', 'pwd')
  .nargs('w', 1)
  .describe('w', 'TURN server user password')
  .demand('s')
  .alias('s', 'ws')
  .nargs('s', 1)
  .describe('s', 'Signaling server')
  .help('h')
  .alias('h', 'help')
  .argv

describe('flunky transports', function () {
  this.timeout(10000)

  it('should return echo messages using udp transport and close server afterwards', function (done) {
    var clientRegistrationInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20000
      }
    }
    var clientSocket = new UdpTransport()
    var serverRegistrationInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20001
      }
    }
    var serverSocket = new UdpTransport()
    // execute echo test
    testEchoMessages({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, done)
  })

  it('should return echo messages using tcp transport and close receiving transport afterwards', function (done) {
    var clientRegistrationInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20002
      }
    }
    var clientSocket = new TcpTransport()
    var serverRegistrationInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20003
      }
    }
    var serverSocket = new TcpTransport()
    // execute echo test
    testEchoMessages({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, done)
  })

  it('should return echo messages using udp+turn transport with local signaling and close receiving transport afterwards', function (done) {
    var localSignaling = new LocalSignaling()
    var clientSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: localSignaling
    })
    var serverSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: localSignaling
    })
    // execute echo test
    testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should return echo messages using tcp+turn transport with local signaling and close receiving transport afterwards', function (done) {
    var localSignaling = new LocalSignaling()
    var clientSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: localSignaling
    })
    var serverSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: localSignaling
    })
    testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should return echo messages using udp+turn transport with WS signaling and close receiving transport afterwards', function (done) {
    var clientRegistrationInfo = {
      transportType: 'turn',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'nicoj',
        url: argv.ws
      }
    }
    var clientSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling()
    })
    var serverRegistrationInfo = {
      transportType: 'turn',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'tdelaet',
        url: argv.ws
      }
    }
    var serverSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling()
    })
    testEchoMessages({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, done)
  })

  it('should return echo messages using tcp+turn transport with WS signaling and close receiving transport afterwards', function (done) {
    var clientSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling({wsUrl: argv.ws})
    })
    var serverSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling({wsUrl: argv.ws})
    })
    testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket
    }, done)
  })

  it('should correctly close UDP stream by destroying client socket', function (done) {
    var clientRegistrationInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20004
      }
    }
    var clientSocket = new UdpTransport()
    var serverRegistrationInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20005
      }
    }
    var serverSocket = new UdpTransport()
    // execute echo test
    testDestroyStream({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, 'client',
      done)
  })

  it('should correctly close UDP stream by destroying server socket', function (done) {
    var clientRegistrationInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20006
      }
    }
    var clientSocket = new UdpTransport()
    var serverRegistrationInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20007
      }
    }
    var serverSocket = new UdpTransport()
    // execute echo test
    testDestroyStream({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, 'server',
      done)
  })

  it('should correctly close TCP stream by destroying client socket', function (done) {
    var clientRegistrationInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20008
      }
    }
    var clientSocket = new TcpTransport()
    var serverRegistrationInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20009
      }
    }
    var serverSocket = new TcpTransport()
    // execute echo test
    testDestroyStream({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, 'client',
      done)
  })

  it('should correctly close TCP stream by destroying server socket', function (done) {
    var clientRegistrationInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20010
      }
    }
    var clientSocket = new TcpTransport()
    var serverRegistrationInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20011
      }
    }
    var serverSocket = new TcpTransport()
    // execute echo test
    testDestroyStream({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, 'server',
      done)
  })

  it('should correctly close TURN stream by destroying client socket', function (done) {
    var clientRegistrationInfo = {
      transportType: 'turn',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'nicoj',
        url: argv.ws
      }
    }
    var clientSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling()
    })
    var serverRegistrationInfo = {
      transportType: 'turn',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'tdelaet',
        url: argv.ws
      }
    }
    var serverSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling()
    })
    // execute echo test
    testDestroyStream({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, 'client',
      done)
  })

  it('should correctly close TURN stream by destroying server socket', function (done) {
    var clientRegistrationInfo = {
      transportType: 'turn',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'nicoj',
        url: argv.ws
      }
    }
    var clientSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.UDP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling()
    })
    var serverRegistrationInfo = {
      transportType: 'turn',
      transportInfo: {
        type: 'websocket-signaling',
        uid: 'tdelaet',
        url: argv.ws
      }
    }
    var serverSocket = new TurnTransport({
      turnServer: argv.addr,
      turnPort: argv.port,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: argv.user,
      turnPassword: argv.pwd,
      signaling: new WebSocketSignaling()
    })
    // execute echo test
    testDestroyStream({
      socket: clientSocket,
      registrationInfo: clientRegistrationInfo
    }, {
      socket: serverSocket,
      registrationInfo: serverRegistrationInfo
    }, 'server',
      done)
  })
})

function testEchoMessages (clientSpecs, serverSpecs, done) {
  var nbTestMessages = 10
  var currentTestMessage = 0

  var clientSocket = clientSpecs.socket
  var serverSocket = serverSpecs.socket
  var clientRegistrationInfo = clientSpecs.registrationInfo
  var serverRegistrationInfo = serverSpecs.registrationInfo

  var clientReadStreamEnded = false
  var clientWriteStreamEnded = false
  var echoReadStreamEnded = false
  var echoWriteStreamEnded = false

  var clientConnectionInfo, serverConnectionInfo
  // when a new stream is generated
  serverSocket.on('connection', function (echoStream, connectionInfo) {
    console.log('echo stream available')
    expect(connectionInfo).to.not.be.undefined
    // then pipe the read stream to the write stream (echo behavior)
    echoStream.pipe(echoStream)
    // write stream end
    echoStream.on('finish', function () {
      console.log('echo write stream ended')
      // check if echo read stream has ended
      expect(echoReadStreamEnded).to.be.true
      echoWriteStreamEnded = true
    })
    // read stream end
    echoStream.on('end', function () {
      console.log('echo read stream ended')
      // check if client write stream has ended
      expect(clientWriteStreamEnded).to.be.true
      echoReadStreamEnded = true
    })
    // // try to close server socket
    // serverSocket.close(function () {
    //   console.log('CLOSED')
    //   console.log(clientReadStreamEnded) //false
    //   console.log(clientWriteStreamEnded) //true
    //   console.log(echoReadStreamEnded) //false
    //   console.log(echoWriteStreamEnded) //false
    //   // expect(clientReadStreamEnded).to.be.true
    //   // expect(clientWriteStreamEnded).to.be.true
    //   // expect(echoReadStreamEnded).to.be.true
    //   // expect(echoWriteStreamEnded).to.be.true
    //   //done()
    // }, function (error) {
    //   done(error)
    // })
  })

  function sendTestMessage (stream) {
    var testMessage = 'test message ' + currentTestMessage
    console.log('sending message ' + testMessage)
    stream.write(testMessage)
  }

  // bind echo socket
  serverSocket.activateP(serverRegistrationInfo)
    .then(function (connectionInfo) {
      serverConnectionInfo = connectionInfo
      if (serverRegistrationInfo) {
        expect(serverConnectionInfo).to.deep.equal(serverRegistrationInfo)
      }
      return clientSocket.activateP(clientRegistrationInfo)
    })
    .then(function (connectionInfo) {
      clientConnectionInfo = connectionInfo
      if (clientRegistrationInfo) {
        expect(clientConnectionInfo).to.deep.equal(clientRegistrationInfo)
      }
      return clientSocket.connectP(serverConnectionInfo)
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
        // check if echo write stream has ended
        expect(echoWriteStreamEnded).to.be.true
        clientReadStreamEnded = true
        done()
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
  var clientRegistrationInfo = clientSpecs.registrationInfo
  var serverRegistrationInfo = serverSpecs.registrationInfo

  var clientConnectionInfo, serverConnectionInfo
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
  serverSocket.activateP(serverRegistrationInfo)
    .then(function (connectionInfo) {
      serverConnectionInfo = connectionInfo
      if (serverRegistrationInfo) {
        expect(serverConnectionInfo).to.deep.equal(serverRegistrationInfo)
      }
      return clientSocket.activateP(clientRegistrationInfo)
    })
    .then(function (connectionInfo) {
      clientConnectionInfo = connectionInfo
      if (clientRegistrationInfo) {
        expect(clientConnectionInfo).to.deep.equal(clientRegistrationInfo)
      }
      return clientSocket.connectP(serverConnectionInfo)
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
