'use strict'

var dgram = require('dgram') // browserify will replace this with chrome-dgram

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

function done (error) {
  var message = (error === undefined) ? 'done' : error
  socket.send(message, 0, message.length, testSocketPort, '127.0.0.1')
}

function onError (error) {
  console.error('socket error:\n' + error.stack)
  done(error)
}

function runTest () {
  var net = require('../../lib/net')

  var onetpTransports = require('../../lib/transports')
  var TcpTransport = onetpTransports.tcp
  var UdpTransport = onetpTransports.udp
  var TurnTransport = onetpTransports.turn
  var WebRtcTransport = onetpTransports.webrtc
  var TurnProtocols = require('turn-js').transports
  var WebSocketSignaling = require('../../lib/signaling/out-of-band').websocket

  var transports = []
  // udp
  if (UdpTransport.isCompatibleWithRuntime()) {
    transports.push(new UdpTransport())
  }
  // tcp
  if (TcpTransport.isCompatibleWithRuntime()) {
    transports.push(new TcpTransport())
  }
  // turn-udp
  var turnUdpConfig = {
    turnServer: turnAddr,
    turnPort: turnPort,
    turnProtocol: new TurnProtocols.UDP(),
    turnUsername: turnUser,
    turnPassword: turnPwd,
    signaling: new WebSocketSignaling({
      url: registrar
    })
  }
  if (TurnTransport.isCompatibleWithRuntime(turnUdpConfig)) {
    transports.push(new TurnTransport(turnUdpConfig))
  }
  // turn-tcp
  var turnTcpConfig = {
    turnServer: turnAddr,
    turnPort: turnPort,
    turnProtocol: new TurnProtocols.TCP(),
    turnUsername: turnUser,
    turnPassword: turnPwd,
    signaling: new WebSocketSignaling({
      url: registrar
    })
  }
  if (TurnTransport.isCompatibleWithRuntime(turnTcpConfig)) {
    transports.push(new TurnTransport(turnTcpConfig))
  }
  // webrtc
  if (WebRtcTransport.isCompatibleWithRuntime()) {
    transports.push(
      new WebRtcTransport({
        config: { iceServers: [ { url: 'stun:23.21.150.121' } ] },
        signaling: new WebSocketSignaling({
          url: registrar
        })
      })
    )
  }
  var onetpServer = net.createServer(transports, function (connection) {
    // do nothing
  })
  onetpServer.listen(function () {
    if (onetpServer.address() === undefined) {
      done('server address undefined')
    } else if (onetpServer.address().length === 0) {
      done('server address empty')
    } else {
      done()
    }
  })
}

function onDeviceReady () {
  console.log('device ready')
  runTest()
}

// start test
if (window.cordova === undefined) {
  runTest()
} else {
  document.addEventListener('deviceready', onDeviceReady, false)
}
