'use strict'

var ApprtcSocket = require('apprtc-socket')
var readline = require('readline')

var onetpTransports = require('../index').transports
var TcpTransport = onetpTransports.tcp
var TurnTransport = onetpTransports.turn
var UdpTransport = onetpTransports.udp

var WebSocketSignaling = require('../index').signaling.websocket

var net = require('../index').net

var argv = require('yargs')
  .usage('Usage: $0 [params]')
  .demand('m')
  .alias('m', 'myid')
  .nargs('m', 1)
  .describe('m', 'My UID')
  .demand('o')
  .alias('o', 'peerid')
  .nargs('o', 1)
  .describe('o', 'Peer ID')
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
  .demand('s')
  .alias('s', 'ws')
  .nargs('s', 1)
  .describe('s', 'Signaling server')
  .help('h')
  .alias('h', 'help')
  .argv

var onetpServer
var onetpClient

// activate signaling socket
var signalingSocket = ApprtcSocket(argv.myid, argv.peerid)
signalingSocket.on('error', function (error) {
  console.error(error)
})

signalingSocket.on('message', function (message) {
  var request = JSON.parse(message)
  // drop my non-init message
  if (request.type !== 'init') {
    return
  }
  // create clientSocket
  var transports = []
  transports.push(new UdpTransport())
  transports.push(new TcpTransport())
  transports.push(new TurnTransport({
    turnServer: argv.addr,
    turnPort: argv.port,
    turnUsername: argv.user,
    turnPassword: argv.pwd,
    signaling: new WebSocketSignaling({url: argv.ws})
  }))
  onetpClient = net.createConnection(transports, request.listeningInfo, function () {
    console.log('connection established')
    bindToTerminal(onetpClient)
  })
})

signalingSocket.connectP()
  .then(function () {
    console.log('registered')
    if (argv.myid > argv.peerid) {
      // create server and start listening
      var transports = []
      transports.push(new UdpTransport())
      transports.push(new TcpTransport())
      transports.push(new TurnTransport({
        turnServer: argv.addr,
        turnPort: argv.port,
        turnUsername: argv.user,
        turnPassword: argv.pwd,
        signaling: new WebSocketSignaling({url: argv.ws})
      }))
      onetpServer = net.createServer(transports, function (connection) {
        console.log('connection established')
        bindToTerminal(connection)
      })
      return onetpServer.listenP()
    } else {
      return
    }
  })
  .then(function (listeningInfo) {
    if (listeningInfo) {
      var message = {}
      message.from = argv.myid
      message.to = argv.peerid
      message.type = 'init'
      message.listeningInfo = listeningInfo
      signalingSocket.send(JSON.stringify(message))
    }
  })
  .catch(function (error) {
    console.error(error)
  })

function bindToTerminal(connection) {
  // pipe outputstream
  connection.on('data', function (data) {
    console.log(argv.peerid + ': ' + data)
  })
  // activate input stream
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  })
  rl.on('line', function (message) {
    connection.write(message)
    console.log(argv.myid + ': ' + message)
  })
}
