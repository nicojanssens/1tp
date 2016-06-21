'use strict'

var turn = require('turn-js')
var TurnTransports = turn.transports
var TurnStream = require('../../src/transports/streams/turn')

var chai = require('chai')
var expect = chai.expect

var turnAddr = process.env.TURN_ADDR
var turnPort = process.env.TURN_PORT
var turnUser = process.env.TURN_USER
var turnPwd = process.env.TURN_PASS
var turnProto = process.env.TURN_PROTO || 'tcp'

describe('Testing turn stream', function () {
  this.timeout(15000)

  it('should return echo messages and end stream', function (done) {
    var clientAlice, clientBob
    if (turnProto === 'udp') {
      clientAlice = turn(turnAddr, turnPort, turnUser, turnPwd)
      clientBob = turn(turnAddr, turnPort, turnUser, turnPwd)
    } else {
      clientAlice = turn(turnAddr, turnPort, turnUser, turnPwd, new TurnTransports.TCP())
      clientBob = turn(turnAddr, turnPort, turnUser, turnPwd, new TurnTransports.TCP())
    }
    var connectionInfoAlice, connectionInfoBob
    var streamAlice, streamBob
    var nbTestMessages = 10
    var currentTestMessage = 0

    function sendTestMessage () {
      var testMessage = 'test message ' + currentTestMessage
      streamAlice.write(testMessage)
    }

    // allocate session alice
    clientAlice.allocateP()
      .then(function (allocateAddress) {
        connectionInfoAlice = allocateAddress
        console.log("alice's connectionInfo = " + JSON.stringify(connectionInfoAlice))
        // allocate session bob
        return clientBob.allocateP()
      })
      .then(function (allocateAddress) {
        connectionInfoBob = allocateAddress
        console.log("bob's connectionInfo = " + JSON.stringify(connectionInfoBob))
        // create permission for alice to send messages to bob
        return clientBob.createPermissionP(connectionInfoAlice.relayedAddress.address)
      })
      .then(function () {
        // create permission for bob to send messages to alice
        return clientAlice.createPermissionP(connectionInfoBob.relayedAddress.address)
      })
      .then(function () {
        // create streams
        streamAlice = new TurnStream(connectionInfoBob, clientAlice)
        streamBob = new TurnStream(connectionInfoAlice, clientBob)
        streamBob.pipe(streamBob)
        // config sender
        streamAlice.on('data', function (bytes) {
          var message = bytes.toString()
          console.log('alice received response: ' + message)
          expect(message.toString()).to.equal('test message ' + currentTestMessage++)
          if (currentTestMessage !== nbTestMessages) {
            sendTestMessage()
          } else {
            // clientStream.end()
            // clientStream.emit('end')
            clientAlice.closeP()
              .then(function () {
                return clientBob.closeP()
              })
              .then(function () {
                done()
              })
          }
        })
        // send test message
        sendTestMessage()
      })
  })
})
