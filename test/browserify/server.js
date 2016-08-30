'use strict'

var dgram = require('dgram') // browserify will replace this with chrome-dgram
var net = require('../../lib/net')

var onetpTransports = require('../../lib/transports')
var TcpTransport = onetpTransports.tcp
var UdpTransport = onetpTransports.udp
var TurnTransport = onetpTransports.turn
var TurnProtocols = require('turn-js').transports
var WebSocketSignaling = require('../../lib/signaling').websocket

var turnAddr = process.env.turnAddr
var turnPort = process.env.turnPort
var turnUser = process.env.turnUser
var turnPwd = process.env.turnPwd
var registrar = process.env.registrar
var testSocketPort = process.env.testSocketPort

console.log('turn address: ' + turnAddr)
console.log('turn port: ' + turnPort)
console.log('turn user: ' + turnUser)
console.log('turn password: ' + turnPwd)
console.log('1tp registrar: ' + registrar)
console.log('test socket port: ' + testSocketPort)

// create socket
var socket = dgram.createSocket('udp4')
socket.on('error', onError)
// launch 1tp server
launchOneTpServer()

function done(error) {
  var message = (error === undefined)? 'done': error
  socket.send(message, 0, message.length, testSocketPort, '127.0.0.1')
}

function onError (error) {
  console.error('socket error:\n' + error.stack)
  done(error)
}

function launchOneTpServer() {
  var transports = []
  transports.push(new UdpTransport())
  transports.push(new TcpTransport())
  transports.push(
    new TurnTransport({
      turnServer: turnAddr,
      turnPort: turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: turnUser,
      turnPassword: turnPwd,
      signaling: new WebSocketSignaling({
        url: registrar
      })
    })
  )
  console.log('listen')
  var server = net.createServer(transports, function (connection) {
    // do nothing
  })
  server.listen(function () {
    console.log('listening')
    console.log(JSON.stringify(server.address()))
    done()
  })
}
