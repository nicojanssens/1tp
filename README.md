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
    url: ONETP_REGISTRAR
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
      url: ONETP_REGISTRAR
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

The optional `connectionListener` argument is automatically set as a listener for the `connection` event.

The `transports` argument specifies an optional array of transport protocols this server instance must activate. The current implementation of 1tp includes the following transports (see also example above):
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
Instruct the 1tp server to begin accepting connections.

The `listeningInfo` parameter specifies an optional array of transport binding attributes. 1tp passes these parameters to the associated transport protocols when instructing them to begin accepting connections. The example below illustrates a `listeningInfo` object informing 1tp to bind its udp transport to 127.0.0.1/20000 and its tcp transports to 127.0.0.1/20001
```js
[{
  transportType: 'udp',
  transportInfo: {
    address: '127.0.0.1',
    port: 20000
  }
}, {
  transportType: 'tcp',
  transportInfo: {
    address: '127.0.0.1',
    port: 20001
  }
}]
```
The optional `callback` argument is automatically set as a listener for the `listening` event.

### `server.listenP([listeningInfo])`
Instruct the 1tp server to begin accepting connections. Instead of firing a `listening` event, this function returns a promise that gets fulfilled once all registered transport protocols are accepting connections. This promise returns the same `connectionInfo` as `server.address()` -- see below

### `server.address()`
Return the `connectionInfo` generated by the active transports. This `connectionInfo` is an array of transport specific endpoint information. The example below illustrates the `connectionInfo` address of a 1tp server
```js
[ { transportType: 'udp',
    transportInfo: { address: '192.168.1.30', port: 61773 },
    version: '0.2.12' },
  { transportType: 'udp',
    transportInfo: { address: '192.168.241.1', port: 61773 },
    version: '0.2.12' },
  { transportType: 'tcp',
    transportInfo: { address: '192.168.1.30', port: 61564 },
    version: '0.2.12' },
  { transportType: 'tcp',
    transportInfo: { address: '192.168.241.1', port: 61564 },
    version: '0.2.12' },
  { transportType: 'turn',
    transportInfo:
     { type: 'websocket-signaling',
       uid: '1636e5e5437eb1733e1d22d21a50e478',
       url: 'http://1.2.3.4/' },
    version: '0.2.12' } ]
```

### `server.close()`
Not implemented yet.

### `var socket = new Socket([transports])`
Create a new 1tp socket (client) object.

The optional `transports` argument specifies which transport protocols this socket should use to establish a connection with a 1tp server. See above for more details about the specification of these transport protocols.

### `socket.connect(connectionInfo[, connectListener])`
Setup a connection with a 1tp server.

The `connectionInfo` argument specifies the 1tp server to connect with. As specified above, this `connectionInfo` object is a collection of transport specific endpoint information.

The optional `connectListener` argument is automatically set as a listener for the `connect` event.

### `socket.isConnected()`
Returns true if one of the transport protocols has established a connection with a 1tp server.

### `socket.destroy()`
Not implemented yet.

### `socket.end()`
Not implemented yet.

### `socket.write(data[, encoding][, callback])`
Send data on the socket.

### `net.createServer([transports][, connectionListener])`
Create and return a new 1tp server instance.

The `transports` argument specifies an optional array of transport protocols this server instance must activate. See above for more details.

The optional `connectionListener` argument is automatically set as a listener for the `connection` event.

### `net.createConnection(connectionInfo[, transports][, connectListener])`
Create and return a new 1tp socket instance.

The `connectionInfo` argument specifies the end-point to connect with. As specified above, this `connectionInfo` is an array of transport specific endpoint information.

The optional `transports` argument specifies which transport  protocols this socket should use to establish a connection with a 1tp server. See above for more details about the specification of these transport protocols.

The optional `connectListener` argument is automatically set as a listener for the `connect` event.

## Events

### `socket.on('connect', function() {})`
Emitted when a socket connection is successfully established -- i.e. one of the transport protocols has established a connection with a 1tp server.

### `server.on('connection', function(socket) {})`
Emitted when a new connection is made. `socket` is an instance of `net.Socket`.

### `server.on('error', function(error) {})`
Emitted when an error occurs.  

### `server.on('listening', function() {})`
Emitted once all registered transport protocols are accepting connections after calling `server.listen`.

### `socket.on('close', function() {})`
Emitted once the socket is fully closed. WiP.

### `socket.on('data', function(data) {})`
Emitted when data is received. The `data` argument is a Buffer.

### `socket.on('end', function() {})`
Emitted when the connected socket has ended its write stream. WiP.

### `socket.on('error', function(error) {})`
Emitted when an error occurs.

## Examples
See examples directory.
