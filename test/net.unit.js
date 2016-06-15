'use strict'

var net = require('../src/net')
var Server = net.Server

var transports = require('../src/transports')
var TcpTransport = transports.tcp
var TurnTransport = transports.turn
var UdpTransport = transports.udp

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

describe('net api', function () {
  it('should init and activate a new server using UDP, TCP and turn transports', function (done) {
    var transports = []
    transports.push(new UdpTransport())
    transports.push(new TcpTransport())
    transports.push(
      new TurnTransport({
        turnServer: argv.addr,
        turnPort: argv.port,
        turnUsername: argv.user,
        turnPassword: argv.pwd,
        signaling: new WebSocketSignaling({wsUrl: argv.ws})
      })
    )
    var server = new Server(transports)
    server.listen(function () {
      expect(server.address()).to.not.be.undefined
      done()
    })
  })

  it('should bind new server using UDP -- no callback', function (done) {
    var transports = []
    transports.push(new UdpTransport())
    var server = new Server(transports)
    server.on('listening', function () {
      expect(server.address()).to.not.be.undefined
      done()
    })
    server.listen()
  })

  it('should bind new server using UDP and TCP -- no callback and entering specific connection info', function (done) {
    var transports = []
    transports.push(new UdpTransport())
    transports.push(new TcpTransport())
    var server = new Server(transports)
    var registrationInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20000
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20001
      }
    }]
    server.on('listening', function () {
      expect(server.address()).to.not.be.undefined
      expect(server.address()).to.deep.equal(registrationInfo)
      done()
    })
    server.listen(registrationInfo)
  })

  it('should bind new server using UDP and TCP -- entering callback and specific connection info', function (done) {
    var transports = []
    transports.push(new UdpTransport())
    transports.push(new TcpTransport())
    var server = new Server(transports)
    var registrationInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20002
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20003
      }
    }]
    server.listen(registrationInfo, function () {
      expect(server.address()).to.not.be.undefined
      done()
    })
  })

  it('should bind server using net.createServer function', function (done) {
    var transports = []
    transports.push(new UdpTransport())
    transports.push(new TcpTransport())
    var registrationInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20004
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20005
      }
    }]
    var server = net.createServer(transports)
    server.listen(registrationInfo, function () {
      expect(server.address()).to.not.be.undefined
      expect(server.address()).to.deep.equal(registrationInfo)
      done()
    })
  })

  it('should establish a connection between two UDP sockets and exchange a test message', function (done) {
    var client, server
    var testMessage = 'test'

    var localUdpServerInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20006
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
          done()
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
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    server = createServer()
    launchServer(localUdpServerInfo, function () {
      createClient(localUdpServerInfo)
    })
  })

  it('should run server listening to TCP socket + client tries connecting over TCP and UDP', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new TcpTransport())
      var server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          done()
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
      transports.push(new TcpTransport())
      transports.push(new UdpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    var serverInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20009
      }
    }]
    var connectionInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20009
      }
    }, {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20010
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to TCP socket + client tries connecting over UDP and TCP', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new TcpTransport())
      var server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          done()
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
      transports.push(new TcpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    var serverInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20011
      }
    }]
    var connectionInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20012
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20011
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to UDP socket + client tries connecting over UDP and TCP', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new UdpTransport())
      var server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          done()
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
      transports.push(new TcpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    var serverInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20013
      }
    }]
    var connectionInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20013
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20014
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to UDP socket + client tries connecting over TCP and UDP', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new UdpTransport())
      var server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          done()
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
      transports.push(new TcpTransport())
      transports.push(new UdpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    var serverInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20015
      }
    }]
    var connectionInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20016
      }
    }, {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20015
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to UDP socket + client tries connecting over TCP', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new UdpTransport())
      var server = net.createServer(transports, function (connection) {
        var errorMsg = 'not expecting to receive a connection event'
        done(errorMsg)
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
      transports.push(new TcpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        var errorMsg = 'not expecting to receive a connection event'
        done(errorMsg)
      })
      client.on('error', function (error) {
        done()
      })
    }

    var serverInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20017
      }
    }]
    var connectionInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20017
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to TCP socket + client tries connecting over UDP and TCP using incorrect connectInfo', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new UdpTransport())
      var server = net.createServer(transports, function (connection) {
        var errorMsg = 'not expecting to receive a connection event'
        done(errorMsg)
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
      transports.push(new TcpTransport())
      transports.push(new UdpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        var errorMsg = 'not expecting to receive a connection event'
        done(errorMsg)
      })
      client.on('error', function (error) {
        done()
      })
    }

    var serverInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20018
      }
    }]
    var connectionInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20019
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20019
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to UDP socket + client tries connecting to two different UDP endpoints', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new UdpTransport())
      var server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          done()
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
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    var serverInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20020
      }
    }]
    var connectionInfo = [{
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20021
      }
    }, {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20020
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })

  it('should run server listening to TCP socket + client tries connecting to two different TCP endpoints', function (done) {
    var client, server
    var testMessage = 'test'

    var createServer = function () {
      var transports = []
      transports.push(new TcpTransport())
      var server = net.createServer(transports, function (connection) {
        expect(connection).to.not.be.undefined
        expect(connection.isConnected()).to.be.true
        expect(connection.remoteAddress).to.not.be.undefined
        connection.on('data', function (data) {
          expect(data.toString()).to.equal(testMessage)
          done()
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
      transports.push(new TcpTransport())
      client = net.createConnection(transports, serverInfo, function () {
        expect(client.isConnected()).to.be.true
        expect(client.remoteAddress).to.not.be.undefined
        client.write(testMessage)
      })
      expect(client.isConnected()).to.be.false
    }

    var serverInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20022
      }
    }]
    var connectionInfo = [{
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20023
      }
    }, {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20022
      }
    }]

    server = createServer()
    launchServer(serverInfo, function () {
      createClient(connectionInfo)
    })
  })
})
