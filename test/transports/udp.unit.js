'use strict'

var tests = require('./tests.js')
var UdpTransport = require('../../index').transports.udp

var chai = require('chai')
var expect = chai.expect

describe('udp transport', function () {
  this.timeout(2000)

  it('should return echo messages and close server afterwards', function (done) {
    var clientSocket = new UdpTransport()
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20000
      }
    }
    var serverSocket = new UdpTransport()
    // execute echo test
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    }, done)
  })

  it('should correctly close after destroying client socket', function (done) {
    var clientSocket = new UdpTransport()
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20001
      }
    }
    var serverSocket = new UdpTransport()
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
    var clientSocket = new UdpTransport()
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20002
      }
    }
    var serverSocket = new UdpTransport()
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    }, 'server',
      done)
  })

  it('should correctly handle a timeout', function (done) {
    var clientSocket = new UdpTransport()
    var connectionInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20003
      }
    }
    clientSocket.connectP(connectionInfo)
      .then(function (stream) {
        var errorMsg = 'not expecting to receive connected stream ' + stream
        done(errorMsg)
      })
      .catch(function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.include('handshake aborted')
        // test if there are no more sessions left
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        done()
      })
  })
})
