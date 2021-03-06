[![CircleCI](https://circleci.com/gh/MicroMinion/1tp.svg?style=shield)](https://circleci.com/gh/MicroMinion/1tp)
[![npm](https://img.shields.io/npm/v/1tp.svg)](https://npmjs.org/package/1tp)

# 1tp
One transport protocol to rule them all -- offering net socket abstraction on top of various communication protocols

## Summary
Goal of 1tp is to offer a single solution for connecting any two available endpoints -- public, private, mobile, located behind NAT boxes, ... To accomplish this, 1tp acts as a wrapper around various existing transports such as UDP, TCP, WebRTC and TURN (more to come in later releases). The internal details of these transports are concealed via an API similar to node's net API, using sockets and streams. Furthermore, 1tp always tries to use the 'cheapest' transport when establishing a connection between two endpoints. If both endpoints are sharing the same network, for instance, then 1tp will setup a UDP or a TCP connection. If two endpoints are located behind symmetric NAT boxes, then 1tp will negotiate a TURN or a WebRTC session via a shared relay server.  

## Features
- stream based API, highly inspired by node's net API
- current version includes UDP, TCP, WebRTC and TURN connectors -- extending UDP with hole punching + integrating other transports such as websockets, GCM and tor is WiP.
- connection setup mechanism tries to select the 'cheapest' transport -- using different schedulers to execute connection handshakes sequential (default) or in parallel (experimental)
- can be browserified (to be used in chrome and cordova apps)

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
var WebRtcTransport = onetp.transports.webrtc

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
  turnUsername: USERNAME,
  turnPassword: PASSWORD,
  //signaling: localSignaling,
  signaling: new WebSocketSignaling({
    url: ONETP_REGISTRAR
  })
}))
serverTransports.push(new WebRtcTransport({
  config: { iceServers: [ { url: 'stun:stun.l.google.com:19305' } ] },
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
    turnUsername: USERNAME,
    turnPassword: PASSWORD,
    //signaling: localSignaling,
    signaling: new WebSocketSignaling({
      url: ONETP_REGISTRAR
    })
  }))
  clientTransports.push(new WebRtcTransport({
    config: { iceServers: [ { url: 'stun:23.21.150.121' } ] }
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
  * `onetp.transports.webrtc` -- creates WebRTC socket

`onetp.transports.udp` and `onetp.transports.tcp` don't require additional attributes. `onetp.transports.turn`, in contrast, accepts the following specs:
  * `turnServer` (mandatory): IP address of the TURN server to interact with
  * `turnPort` (mandatory): port number of that TURN server
  * `turnUserName` (mandatory): username to access this TURN server
  * `turnPassword` (mandatory): user password to access TURN server
  * `turnProtocol` (optional): transport protocol to interact with TURN server -- default is UDP, see example for using TCP instead
  * `signaling` (mandatory): specify which signaling server to use (loopback or [1tp-registrar](https://github.com/MicroMinion/1tp-registrar)). When using [1tp-registrar](https://github.com/MicroMinion/1tp-registrar)), you need to specify the URL of the server

`onetp.transports.webrtc` also requires to specify what `signaling` server it should use. Additionally, this transports accepts all [simple-peer](https://github.com/feross/simple-peer) (data channel) options.  

When creating a server instance without specifying which transports to use, 1tp
  * activates the transports that are compatible with the runtime -- see compatibility table below, and
  * activates TURN if environment variables `TURN_ADDR`, `TURN_PORT`, `TURN_USER`, `TURN_PASS` and `ONETP_REGISTRAR` are all set

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

Mind that `listeningInfo` data is indicative. If the listen operation fails due to incorrect `listeningInfo` data (such as an unavailable address), then the 1tp server retries executing this operation without `listeningInfo`.

The optional `callback` argument is automatically set as a listener for the `listening` event.

### `server.listenP([listeningInfo])`
Instruct the 1tp server to begin accepting connections. Instead of firing a `listening` event, this function returns a promise that gets fulfilled once all registered transport protocols are accepting connections. This promise returns the same `connectionInfo` as `server.address()` -- see below

### `server.address()`
Return the `connectionInfo` generated by the active transports. This `connectionInfo` is an array of transport specific endpoint information. The example below illustrates the `connectionInfo` address of a 1tp server
```js
[ { transportType: 'udp',
    transportInfo: { address: '192.168.1.30', port: 61773 },
    version: '0.17.4' },
  { transportType: 'udp',
    transportInfo: { address: '192.168.241.1', port: 61773 },
    version: '0.17.4' },
  { transportType: 'tcp',
    transportInfo: { address: '192.168.1.30', port: 61564 },
    version: '0.17.4' },
  { transportType: 'tcp',
    transportInfo: { address: '192.168.241.1', port: 61564 },
    version: '0.17.4' },
  { transportType: 'turn-tcp',
    transportInfo:
     { type: 'websocket-signaling',
       uid: '1636e5e5437eb1733e1d22d21a50e478',
       url: 'http://1.2.3.4/' },
    version: '0.17.4' } ]
```

### `server.close()`
Stops the server from accepting new connections and keeps existing connections. This function is asynchronous, the server is finally closed when all connections are ended and the server emits a 'close' event. The optional callback will be called once the 'close' event occurs. [copied from [nodejs docs](https://nodejs.org/api/net.html#net_server_close_callback)]

### `var socket = new Socket([transports][, args])`
Create a new 1tp socket (client) object.

The optional `transports` argument specifies which transport protocols this socket should use to establish a connection with a 1tp server. See above for more details about the specification of these transport protocols.

The optional `args` object includes additional flags that specify the behavior of this socket. Currently, only the `parallelConnectionSetup` flag is supported, instructing the socket to schedule all connection attempts in parallel rather than sequential (which is the default behavior). Note that this is still a highly  *experimental* feature.

### `socket.connect(connectionInfo[, connectListener])`
Setup a connection with a 1tp server.

The `connectionInfo` argument specifies the 1tp server to connect with. As specified above, this `connectionInfo` object is a collection of transport specific endpoint information.

The optional `connectListener` argument is automatically set as a listener for the `connect` event.

### `socket.isConnected()`
Returns true if one of the transport protocols has established a connection with a 1tp server.

### `socket.remoteAddress`
Contains the `connectionInfo` of the connected peer.

### `socket.destroy()`
Closes the socket, no more communication possible after completing this operation. Emits a `close` event when connection is closed.

### `socket.end()`
Half-closes the socket, server may still end some data.

### `socket.setTimeout(timeout[, callback])`
Sets the socket to timeout after `timeout` milliseconds of inactivity. The socket then fires a `timeout` event.  

If `timeout` is 0, then the existing idle timeout is disabled.

The optional `callback` is automatically set as a one time listener for the `timeout` event.

### `socket.write(data[, encoding][, callback])`
Send data on the socket.

### `net.createServer([transports][, connectionListener])`
Create and return a new 1tp server instance.

The `transports` argument specifies an optional array of transport protocols this server instance must activate. See above for more details.

The optional `connectionListener` argument is automatically set as a listener for the `connection` event.

### `net.createConnection(connectionInfo[, transports][, args][, connectListener])`
Create and return a new 1tp socket instance.

The `connectionInfo` argument specifies the end-point to connect with. As specified above, this `connectionInfo` is an array of transport specific endpoint information.

The optional `transports` argument specifies which transport protocols this socket should use to establish a connection with a 1tp server. See above for more details about the specification of these transport protocols.

The optional `args` object includes additional flags that specify the behavior of this socket. See above for more details about this option.

The optional `connectListener` argument is automatically set as a listener for the `connect` event.

## Events

### `server.on('connection', function(socket) {})`
Emitted when a new connection is made. `socket` is an instance of 1tp's `net.Socket`.

### `server.on('error', function(error) {})`
Emitted when an error occurs.  

### `server.on('listening', function() {})`
Emitted once all registered transport protocols are accepting connections after calling `server.listen`.

### `socket.on('connect', function() {})`
Emitted when a socket connection is successfully established -- i.e. one of the transport protocols has established a connection with a 1tp server.

### `socket.on('data', function(data) {})`
Emitted when data is received. The `data` argument is a Buffer.

### `socket.on('end', function() {})`
Emitted when the connected socket has ended its write stream.

### `socket.on('finish', function() {})`
Emitted when there is no more data to be consumed from the socket's read stream.

### `socket.on('close', function() {})`
Emitted once the socket is fully closed -- after executing `socket.destroy`

### `socket.on('error', function(error) {})`
Emitted when an error occurs.

### `socket.on('timeout', function() {})`
Emitted if the socket times out from inactivity -- notifying that the socket has been idle.

## Chrome and cordova apps

```
gulp browserify [--production]
```
Creates `1tp.debug.js` and `1tp.min.js` in `build` folder, which can be used in chrome and cordova apps. When integrating 1tp in a cordova app, use the  `cordova-plugin-chrome-apps-sockets-udp`and `cordova-plugin-chrome-apps-system-network` plugins  ~~and `cordova-plugin-chrome-apps-sockets-tcp` and `cordova-plugin-chrome-apps-sockets-tcpserver plugins`~~ (tcp cordova plugins generate errors):
```
cordova plugin add cordova-plugin-chrome-apps-sockets-udp
cordova plugin add cordova-plugin-networkinterface
```

## Compatibility -- current status

|     | UDP | TCP | TURN+UDP | TURN+TCP | WebRTC |
| --- |:---:|:---:|:---:|:---:|:---:|
| node.js x86 | + | + | + | + | + |
| node.js arm | + | + | + | + | - |
| chrome browser | - | - | - | - | + |
| chrome app     | + | + | + | + | + |
| cordova android | + | - | + | - | + |
| cordova ios | + | - | + | - | - |

## Examples
See examples directory.
