'use strict'

var FilteringUdpTransport = require('./filters/udp-transport')
var signalingFactory = require('../../lib/signaling/in-band/factory')
var tests = require('./tests.js')
var UdpTransport = require('../../index').transports.udp

var chai = require('chai')
var expect = chai.expect

describe('udp transport', function () {
  this.timeout(5000)

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
    },
      'client',
      function (clientStream, serverStream) {
        done()
      },
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
    },
      'server',
      function (clientStream, serverStream) {
        done()
      },
      done
    )
  })

  it('should correctly deal with a handshake timeout', function (done) {
    var clientSocket = new UdpTransport({connectTimeout: 10})
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
        expect(error.message).to.equal('handshake aborted')
        // test if there are no more sessions left
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        done()
      })
  })

  it('should correctly abort handshake -- case 1', function (done) {
    var clientSocket = new UdpTransport({connectTimeout: 1500})
    var connectionInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20004
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
    }, 500)
  })

  it('should correctly abort handshake -- case 2', function (done) {
    var clientSocket = new UdpTransport({connectTimeout: 1500})
    var connectionInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20005
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
        done()
      })
      .catch(function (error) {
        done(error)
      })
  })

  it('should correctly handle SYN problems', function (done) {
    var timeout = 1500
    var clientSocket = new FilteringUdpTransport({connectTimeout: timeout})
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20006
      }
    }
    var serverSocket = new FilteringUdpTransport()
    serverSocket.dropMessage(signalingFactory.MESSAGE.SYN)

    // not expecting connection events
    serverSocket.on('connection', function () {
      done('server socket should not create new stream')
    })
    serverSocket.on('error', function (error) {
      done(error)
    })

    // bind server socket
    serverSocket.listenP(listeningInfo)
      .then(function (connectionInfo) {
        return clientSocket.connectP(connectionInfo)
      })
      .then(function () {
        // not expecting connection events
        done('client socket should not create new stream')
      })
      .catch(function (error) {
        // we're expecting an abort error
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('handshake aborted')
        // no existing client sessions
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        // and no existing server sessions
        expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        done()
      })
  })

  it('should correctly handle SYN-ACK problems', function (done) {
    var timeout = 1500
    var clientSocket = new FilteringUdpTransport({connectTimeout: timeout})
    clientSocket.dropMessage(signalingFactory.MESSAGE.SYN_ACK)
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20007
      }
    }
    var serverSocket = new FilteringUdpTransport()

    // not expecting connection events
    serverSocket.on('connection', function () {
      done('server socket should not create new stream')
    })
    serverSocket.on('error', function (error) {
      done(error)
    })

    // bind server socket
    serverSocket.listenP(listeningInfo)
      .then(function (connectionInfo) {
        return clientSocket.connectP(connectionInfo)
      })
      .then(function () {
        // not expecting connection events
        done('client socket should not create new stream')
      })
      .catch(function (error) {
        // we're expecting an abort error
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('handshake aborted')
        // no existing client sessions
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        // and no existing server sessions -- wait for server session to timeout
        setTimeout(function () {
          expect(Object.keys(serverSocket._sessions).length).to.equal(0)
          done()
        }, timeout)
      })
  })

  it('should correctly handle FIN problems', function (done) {
    var clientSocket = new FilteringUdpTransport({connectTimeout: 1500})
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20008
      }
    }
    var serverSocket = new FilteringUdpTransport()
    serverSocket.dropMessage(signalingFactory.MESSAGE.FIN)
    // execute echo test
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    },
      function () {
        done("don't expect finish to complete")
      },
      function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('giving up, no more retries left')
        // no existing client sessions
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        //  // and no existing server sessions -- wait for server session to timeout
        //  setTimeout(function () {
        //    expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        //      done()
        //  }, timeout)
        done()
      }
    )
  })

  it('should correctly handle RST problems', function (done) {
    var clientSocket = new FilteringUdpTransport({connectTimeout: 1500})
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20009
      }
    }
    var serverSocket = new FilteringUdpTransport()
    serverSocket.dropMessage(signalingFactory.MESSAGE.RST)
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    },
      'client',
      function (clientStream, serverStream) {
        done("didn't expect destroy operation to complete")
      },
      function (error) {
        expect(error.message).to.be.a('string')
        expect(error.message).to.equal('giving up, no more retries left')
        // no existing client sessions
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        //  // and no existing server sessions -- wait for server session to timeout
        //  setTimeout(function () {
        //    expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        //      done()
        //  }, timeout)
        done()
      }
    )
  })

  it('should correctly handle ACK problems while ending a session', function (done) {
    var clientSocket = new FilteringUdpTransport({connectTimeout: 1500})
    // filter ACKs sent from server to client (so only while closing connection)
    clientSocket.dropMessage(signalingFactory.MESSAGE.ACK)
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20010
      }
    }
    var serverSocket = new FilteringUdpTransport()
    // execute echo test
    tests.testEchoMessages({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    },
      function (clientStream, serverStream) {
        // FIN arrived @ server
        expect(serverStream.readable).to.be.false
        // ACK to client was dropped
        expect(clientStream.writable).to.be.true
        // FIN sent to client -- pipe ends the (echo) writer when the (echo) reader ends
        expect(clientStream.readable).to.be.false
        // ACK sent to server
        expect(serverStream.writable).to.be.false
        // no existing server sessions
        expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        // wait until clientStream is no longer writable -- i.e. FIN operation aborts
        clientStream.on('finish', function () {
          // no existing client sessions
          process.nextTick(function () {
            expect(clientStream.writable).to.be.false
            expect(Object.keys(clientSocket._sessions).length).to.equal(0)
            done()
          })
        })
      },
      function (error) {
        console.log('ignoring error ' + error)
      }
    )
  })

  it('should correctly handle ACK problems while destroying a session', function (done) {
    var clientSocket = new FilteringUdpTransport({connectTimeout: 1500})
    // filter ACKs sent from server to client (so only while closing connection)
    clientSocket.dropMessage(signalingFactory.MESSAGE.ACK)
    var listeningInfo = {
      transportType: 'udp',
      transportInfo: {
        address: '127.0.0.1',
        port: 20011
      }
    }
    var serverSocket = new FilteringUdpTransport()
    // execute echo test
    tests.testDestroyStream({
      socket: clientSocket
    }, {
      socket: serverSocket,
      listeningInfo: listeningInfo
    },
      'client',
      function (clientStream, serverStream) {
        expect(clientStream.readable).to.be.false
        expect(clientStream.writable).to.be.false
        expect(serverStream.readable).to.be.false
        expect(serverStream.writable).to.be.false
        // no server sessions left
        expect(Object.keys(serverSocket._sessions).length).to.equal(0)
        // no client sessions left
        expect(Object.keys(clientSocket._sessions).length).to.equal(0)
        done()
      },
      function (error) {
        console.log('ignoring error ' + error)
      }
    )
  })
})
