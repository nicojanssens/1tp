'use strict'

var net = require('../../../lib/net')

var onetpTransports = require('../../../lib/transports')
var TcpTransport = onetpTransports.tcp
var UdpTransport = onetpTransports.udp
var TurnTransport = onetpTransports.turn
var TurnProtocols = require('turn-js').transports
var WebSocketSignaling = require('../../../lib/signaling').websocket

var serverInfo = process.env.serverInfo
var turnAddr = process.env.turnAddr
var turnPort = process.env.turnPort
var turnUser = process.env.turnUser
var turnPwd = process.env.turnPwd
var registrar = process.env.registrar

console.log(serverInfo)
console.log(turnAddr)
console.log(turnPort)
console.log(turnUser)
console.log(turnPwd)
console.log(registrar)

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
var client = net.createConnection(serverInfo, transports, function () {
  console.log('connection established')
  client.write('hello')
})
