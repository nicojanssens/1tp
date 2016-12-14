'use strict'

var TcpTransport = require('../../index').transports.tcp
var tests = require('./tests.js')

var chai = require('chai')
var expect = chai.expect

describe('tcp transport', function () {
  this.timeout(2000)

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
      },
      function (clientStream, serverStream) {
        expect(clientStream.readable).to.be.false
        //expect(clientStream.writable).to.be.false
        expect(serverStream.readable).to.be.false
        //expect(serverStream.writable).to.be.false
        done()
      },
      function (error) {
        done(error)
      }
    )
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
      },
      'client',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
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
      },
      'server',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
  })

  it('should abort session when server is unreachable', function (done) {
    var clientSocket = new TcpTransport()
    var connectionInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 10003
      }
    }
    clientSocket.connectP(connectionInfo)
      .then(function (stream) {
        var errorMsg = 'not expecting to receive connected stream ' + stream
        done(errorMsg)
      })
      .catch(function (error) {
        expect(error.code).to.be.a('string')
        expect(error.code).to.equal('ECONNREFUSED')
        // test if there are no more sessions left
        expect(Object.keys(clientSocket._connectingSockets).length).to.equal(0)
        done()
      })
  })

  it('should correctly deal with a handshake timeout', function (done) {
    var clientSocket = new TcpTransport({connectTimeout: 1})
    var connectionInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 10004
      }
    }
    clientSocket.connectP(connectionInfo)
      .then(function (stream) {
        var errorMsg = 'not expecting to receive connected stream ' + stream
        done(errorMsg)
      })
      .catch(function (error) {
        expect(error.message).to.be.a('string')
        expect(['connect ECONNREFUSED 127.0.0.1:10004', 'handshake aborted']).to.include(error.message)
        // test if there are no more sessions left
        expect(Object.keys(clientSocket._connectingSockets).length).to.equal(0)
        done()
      })
  })

  it('should correctly abort handshake', function (done) {
    var clientSocket = new TcpTransport({connectTimeout: 1500})
    var connectionInfo = {
      transportType: 'tcp',
      transportInfo: {
        address: '127.0.0.1',
        port: 10005
      }
    }
    clientSocket.connectP(connectionInfo)
      .then(function (stream) {
        var errorMsg = 'not expecting to receive connected stream ' + stream
        done(errorMsg)
      })
      .catch(function (error) {
        done(error)
      })
    clientSocket.abortP(connectionInfo)
      .then(function () {
        expect(Object.keys(clientSocket._connectingSockets).length).to.equal(0)
        done()
      })
      .catch(function (error) {
        done(error)
      })
  })
})
