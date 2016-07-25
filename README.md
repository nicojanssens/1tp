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

// turn transports
var TurnTransports = require('turn-js').transports

// local signaling service to exchange turn handshake messages
var LocalSignaling = onetp.signaling.local
var localSignaling = new LocalSignaling()

// 1tp-registrar signaling service to exchange turn handshake messages
var WebSocketSignaling = onetp.signaling.websocket

// specify which server transports to 'activate'
var serverTransports = []
serverTransports.push(new UdpTransport())
serverTransports.push(new TcpTransport())
serverTransports.push(new TurnTransport({
  turnServer: IP_ADDRESS,
  turnPort: PORT,
  turnProtocol: new TurnTransports.TCP(),
  turnUsername: USERNAME,
  turnPassword: PASSWORD,
  //signaling: localSignaling,
  signaling: new WebSocketSignaling({
    url: ONETP-REGISTRAR
  })
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
    turnProtocol: new TurnTransports.TCP(),
    turnUsername: USERNAME,
    turnPassword: PASSWORD,
    //signaling: localSignaling,
    signaling: new WebSocketSignaling({
      url: ONETP-REGISTRAR
    })
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

## API

### `var server = new Server([transports][, connectionListener])`
Create a new 1tp server instance.

`transports` specifies an optional list of transport protocols this server instance must activate. The current implementation of 1tp includes the following transports (see also example above):
  * `onetp.transports.udp` -- creates UDP dgram socket
  * `onetp.transports.tcp` -- creates TCP net server socket
  * `onetp.transports.turn` -- creates TURN socket

`onetp.transports.udp` and `onetp.transports.tcp` don't require additional attributes. `onetp.transports.turn`, in contrast, accepts the following specs:
  * `turnServer` (mandatory): IP address of the TURN server to interact with
  * `turnPort` (mandatory): port number of that TURN server
  * `turnUserName` (mandatory): username to access this TURN server
  * `turnPassword` (mandatory): user password to access TURN server
  * `turnProtocol` (optional): transport protocol to interact with TURN server -- default is UDP, see example for using TCP instead
  * `signaling` (mandatory): specify which signaling server to use (loopback or [1tp-registrar](https://github.com/MicroMinion/1tp-registrar)). When using [1tp-registrar](https://github.com/MicroMinion/1tp-registrar)), you need to specify the URL of the server

When creating a server instance without specifying which transports to use, 1tp
  * always activates TCP and UDP transports, and
  * activates TURN if environment variables `TURN_ADDR`, `TURN_PORT`, `TURN_USER`, `TURN_PASS` and `ONETP_REGISTRAR` are all set OR if config.json is present (the structure of this file is defined in config.json.template)

### `server.listen([listeningInfo][, callback])`

### `server.listenP([listeningInfo])`

### `server.address()`

### `server.close()`

### `var socket = new Socket([transports])`

### `socket.connect(connectionInfo[, connectListener])`

### `socket.isConnected()`

### `socket.destroy()`
Not implemented yet

### `socket.end()`
Not implemented yet

### `net.createServer([transports][, connectionListener])`

### `net.createConnection(connectionInfo[, transports][, connectionListener])`

## Examples
See examples directory.
