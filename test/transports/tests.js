'use strict'

var chai = require('chai')
var expect = chai.expect
var merge = require('merge')

var defaultProtocolVersion = require('../../package.json').version

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
      console.log('echoStreamClosed')
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
        console.log('clientStreamClosed')
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

module.exports.testEchoMessages = testEchoMessages
module.exports.testDestroyStream = testDestroyStream
