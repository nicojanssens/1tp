'use strict'

var serverInfo = process.env.onetpServerAddress
var turnAddr = process.env.turnAddr
var turnPort = process.env.turnPort
var turnUser = process.env.turnUser
var turnPwd = process.env.turnPwd
var registrar = process.env.registrar

console.log('server info: ' + JSON.stringify(serverInfo))
console.log('turn address: ' + turnAddr)
console.log('turn port: ' + turnPort)
console.log('turn user: ' + turnUser)
console.log('turn password: ' + turnPwd)
console.log('1tp registrar: ' + registrar)

function runTest () {
  var net = require('../../lib/net')

  var onetpTransports = require('../../lib/transports')
  var TcpTransport = onetpTransports.tcp
  var UdpTransport = onetpTransports.udp
  var TurnTransport = onetpTransports.turn
  var WebRtcTransport = onetpTransports.webrtc
  var TurnProtocols = require('turn-js').transports
  var WebSocketSignaling = require('../../lib/signaling').websocket

  var onetpClient

  function done (error) {
    var message = (error === undefined) ? 'done' : error
    onetpClient.write(message)
  }
  // create transports
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
  onetpClient = net.createConnection(serverInfo, transports, function () {
    console.log('connection established')
    onetpClient.on('data', function (data) {
      console.log('received message ' + data)
      done()
    })
    onetpClient.write('hello')
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
