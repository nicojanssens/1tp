[![CircleCI](https://circleci.com/gh/MicroMinion/1tp.svg?style=svg)](https://circleci.com/gh/MicroMinion/1tp)

# 1tp
One transport protocol to rule them all -- offering net socket abstraction on top of various communication protocols

## Summary
Goal of 1tp is to offer a single solution for connecting any two available endpoints -- public, private, mobile, located behind NAT boxes, ... To accomplish this, 1tp acts as a wrapper around various existing transports such as UDP, TCP and TURN (more to come in later releases). The internal details of these transports are concealed via an API similar to node's net API, using sockets and streams. Furthermore, 1tp always tries to use the 'cheapest' transport when establishing a connection between two endpoints. If both endpoints are sharing the same network, for instance, then 1tp will setup a UDP or a TCP connection. If two endpoints are located behind symmetric NAT boxes, then 1tp will negotiate a TURN session via a shared relay server.  

## Features
- stream based API, highly inspired by node's net API
- current version includes UDP, TCP and TURN connectors -- extending UDP with hole punching + integrating other transports such as WebRTC, websockets, GCM and tor is WiP.
- connection setup mechanism tries to select the 'cheapest' transport

## Install

```
npm install 1tp
```

## Usage

```js
'use strict'

var onetp = require('1tp')
var net = onetp.net

// 1tp transports
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
```

## Examples
See examples directory.
