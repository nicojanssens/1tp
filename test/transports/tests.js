'use strict'

var chai = require('chai')
var expect = chai.expect
var merge = require('merge')

var defaultProtocolVersion = require('../../package.json').version

function testEchoMessages (clientSpecs, serverSpecs, onSuccess, onFailure) {
  var nbTestMessages = 10
  var currentTestMessage = 0

  var clientSocket = clientSpecs.socket
  var serverSocket = serverSpecs.socket
  var listeningInfo = serverSpecs.listeningInfo

  var serverTestStream
  var clientTestStream

  // when a new stream is generated
  serverSocket.on('connection', function (echoStream, connectionInfo) {
    console.log('echo stream available')
    serverTestStream = echoStream
    expect(connectionInfo).to.not.be.undefined
    // then pipe the read stream to the write stream (echo behavior)
    echoStream.pipe(echoStream)
    // write stream end
    echoStream.on('finish', function () {
      console.log('echo write stream ended')
    })
    // read stream end
    echoStream.on('end', function () {
      console.log('echo read stream ended')
    })
    // try to close server socket
    serverSocket.close(
      function () {
        setTimeout(function () { // to cope with TCP closing behavior
          onSuccess(
            clientTestStream,
            serverTestStream
          )
        }, 500)
      },
      function (error) {
        onFailure(error)
      })
  })
  serverSocket.on('error', onFailure)

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
      clientTestStream = clientStream
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
      clientStream.on('error', onFailure)
      // read stream end
      clientStream.on('end', function () {
        console.log('client read stream ended')
      })
      // write stream end
      clientStream.on('finish', function () {
        console.log('client write stream ended')
      })
      // send test messages
      sendTestMessage(clientStream)
    })
    .catch(function (error) {
      onFailure(error)
    })
}

function testDestroyStream (clientSpecs, serverSpecs, streamToDestroy, onSuccess, onFailure) {
  var clientSocket = clientSpecs.socket
  var serverSocket = serverSpecs.socket
  var listeningInfo = serverSpecs.listeningInfo

  var serverTestStream
  var clientTestStream
  var clientStreamClosed = false
  var echoStreamClosed = false

  // when a new stream is generated
  serverSocket.on('connection', function (echoStream) {
    console.log('echo stream available')
    serverTestStream = echoStream
    echoStream.on('close', function () {
      console.log('echoStreamClosed')
      echoStreamClosed = true
      if (echoStreamClosed && clientStreamClosed) {
        onSuccess()
      }
    })
    if (!serverTestStream || !clientTestStream) {
      // serverTestStream or clientTestStream are missing -- don't do anything
      return
    }
    if (streamToDestroy === 'client') {
      clientTestStream.destroy()
    } else {
      serverTestStream.destroy()
    }
  })
  serverSocket.on('error', onFailure)

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
      clientTestStream = sourceStream
      sourceStream.on('data', function () {
        var errorMsg = 'not expecting data arrival'
        console.error(errorMsg)
        onFailure(errorMsg)
      })
      sourceStream.on('error', onFailure)
      sourceStream.on('close', function () {
        console.log('clientStreamClosed')
        clientStreamClosed = true
        if (echoStreamClosed && clientStreamClosed) {
          onSuccess(clientTestStream, serverTestStream)
        }
      })
      if (!serverTestStream || !clientTestStream) {
        // serverTestStream or clientTestStream are missing -- don't do anything
        return
      }
      if (streamToDestroy === 'client') {
        clientTestStream.destroy()
      } else {
        serverTestStream.destroy()
      }
    })
    .catch(function (error) {
      onFailure(error)
    })
}

module.exports.testEchoMessages = testEchoMessages
module.exports.testDestroyStream = testDestroyStream
