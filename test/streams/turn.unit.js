'use strict'

var turn = require('turn-js')
var TurnTransports = turn.transports
var TurnStream = require('../../src/transports/streams/turn')

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
  .alias('u', 'user')
  .nargs('u', 1)
  .describe('u', 'TURN server user account')
  .alias('w', 'pwd')
  .nargs('w', 1)
  .describe('w', 'TURN server user password')
  .help('h')
  .alias('h', 'help')
  .argv

describe('Testing turn stream', function () {
  this.timeout(10000)

  it('should return echo messages and end stream', function (done) {
    var clientAlice, clientBob
    if (argv.transport === 'udp') {
      clientAlice = turn(argv.addr, argv.port, argv.user, argv.pwd)
      clientBob = turn(argv.addr, argv.port, argv.user, argv.pwd)
    } else {
      clientAlice = turn(argv.addr, argv.port, argv.user, argv.pwd, new TurnTransports.TCP())
      clientBob = turn(argv.addr, argv.port, argv.user, argv.pwd, new TurnTransports.TCP())
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
