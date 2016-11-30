'use strict'

var TcpTransport = require('../../index').transports.tcp
var tests = require('./tests.js')

describe('tcp transport', function () {
  this.timeout(30000)

  it('should return echo messages and close receiving transport afterwards', function (done) {
    var clientSocket = new TcpTransport()
    var listeningInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 10000
      }
    }
    var serverSocket = new TcpTransport()
    // execute echo test
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    }, done)
  })

  it('should correctly close after destroying client socket', function (done) {
    var clientSocket = new TcpTransport()
    var listeningInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 10001
      }
    }
    var serverSocket = new TcpTransport()
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    }, 'client',
      done)
  })

  it('should correctly close after destroying server socket', function (done) {
    var clientSocket = new TcpTransport()
    var listeningInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 10002
      }
    }
    var serverSocket = new TcpTransport()
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    }, 'server',
      done)
  })
})
