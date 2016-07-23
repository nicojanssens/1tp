'use strict'

var onetp = require('../index')
var net = onetp.net

var UdpTransport = onetp.transports.udp
var TcpTransport = onetp.transports.tcp
var TurnTransport = onetp.transports.turn

// local signaling service to exchange turn handshake messages
var LocalSignaling = onetp.signaling.local
var localSignaling = new LocalSignaling()

// specify which server transports to 'activate'
var serverTransports = []
serverTransports.push(new UdpTransport())
serverTransports.push(new TcpTransport())
serverTransports.push(new TurnTransport({
  turnServer: IP_ADDRESS,
  turnPort: PORT,
  turnUsername: USERNAME,
  turnPassword: PASSWORD,
  signaling: localSignaling
}))
// create server instance
var onetpServer = net.createServer(serverTransports, function (connection) {
  console.log('server connection established')
  // create echo channel
  connection.pipe(connection)
})
// listen for connect event
onetpServer.on('listening', function () {
  // specify which client transports to 'activate'
  var clientTransports = []
  clientTransports.push(new UdpTransport())
  clientTransports.push(new TcpTransport())
  clientTransports.push(new TurnTransport({
    turnServer: IP_ADDRESS,
    turnPort: PORT,
    turnUsername: USERNAME,
    turnPassword: PASSWORD,
    signaling: localSignaling
  }))
  //
  var onetpClient = net.createConnection(onetpServer.address(), clientTransports, function () {
    console.log('client connection established')
    onetpClient.write('hello world')
  })
  onetpClient.on('data', function (data) {
    console.log(data.toString())
  })

})
// launch server
onetpServer.listen()
