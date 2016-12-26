'use strict'

var net = require('../index').net
var Server = net.Server
var Socket = net.Socket

var onetpTransports = require('../lib/transports')
var TcpTransport = onetpTransports.tcp
var TurnTransport = onetpTransports.turn
var UdpTransport = onetpTransports.udp
var WebRtcTransport = onetpTransports.webrtc
var TurnProtocols = require('turn-js').transports

var WebSocketSignaling = require('../lib/signaling/out-of-band').websocket

var chai = require('chai')
var expect = chai.expect

var defaultProtocolVersion = require('../package.json').version

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

describe('net api + parallel scheduler', function () {
  this.timeout(20000)

  it('should establish a connection between two UDP sockets and exchange a test message', function (done) {
    var client, server
    var testMessage = 'test'

    var localUdpServerInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 40010
      }
    }]

    var createServer = function () {
      var transports = []
      transports.push(new UdpTransport())
      server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          var openServerSessions = 0
          setTimeout(function() {
            server._transports.forEach(function (transport) {
              if (transport._sessions !== undefined) {
                openServerSessions += Object.keys(transport._sessions).length
              }
            })
            expect(openServerSessions).to.equal(1)
            done()
          }, client._connectTimeout() + 250)
        })
      })
      return server
    }

    var launchServer = function (serverInfo, onReady) {
      server.listen(serverInfo, function () {
        onReady()
      })
    }

    var createClient = function (serverInfo) {
      var transports = []
      transports.push(new UdpTransport())
      var args = {
        parallelConnectionSetup: true
      }
      client = net.createConnection(serverInfo, transports, args, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        var openClientSessions = 0
        client._transports.forEach(function (transport) {
          if (transport._sessions !== undefined) {
            openClientSessions += Object.keys(transport._sessions).length
          }
        })
        expect(openClientSessions).to.equal(1)
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    server = createServer()
    launchServer(localUdpServerInfo, function () {
      createClient(localUdpServerInfo)
    })
  })

  it('should establish a connection between two 1tp sockets (using default transports) and exchange a test message', function (done) {
    var client, server
    var testMessage = 'test'

    var openClientSessions = 0
    var openServerSessions = 0

    var createServer = function () {
      server = new Server(function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          // check if all aborted client and server sessions are removed
          setTimeout(function() {
            // check if all client sessions have closed
            client._transports.forEach(function (transport) {
              if (transport._sessions !== undefined) {
                openClientSessions += Object.keys(transport._sessions).length
              }
            })
            // TcpTransport does not track ongoing sessions
            if (client.remoteAddress[0].transportType === 'tcp') {
              openClientSessions += 1
            }
            expect(openClientSessions).to.equal(1)

            // check if all server sessions have closed
            server._transports.forEach(function (transport) {
              if (transport._sessions !== undefined) {
                openServerSessions += Object.keys(transport._sessions).length
              }
            })
            // TcpTransport does not track ongoing sessions
            if (connection.remoteAddress[0].transportType === 'tcp') {
              openServerSessions += 1
            }
            expect(openServerSessions).to.equal(1)

            // done
            done()
          }, client._connectTimeout() + 250)
        })
      })
      return server
    }

    var launchServer = function (onReady) {
      server.listen(function () {
        onReady(server.address())
      })
    }

    var createClient = function (connectionInfo) {
      var args = {
        parallelConnectionSetup: true
      }
      client = new Socket(args)
      //console.log(client._connectTimeout())
      client.connect(connectionInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    server = createServer()
    launchServer(function (connectionInfo) {
      createClient(connectionInfo)
    })
  })

})
