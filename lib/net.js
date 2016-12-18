'use strict'

var config = require('./config')
var events = require('events')
var freeice = require('freeice')
var inherits = require('util').inherits
var myUtils = require('./utils')
var ProxyStream = require('./stream')
var Q = require('q')
var TurnProtocols = require('turn-js').transports
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

var onetpTransports = require('./transports')
var TcpTransport = onetpTransports.tcp
var TurnTransport = onetpTransports.turn
var UdpTransport = onetpTransports.udp
var WebRtcTransport = onetpTransports.webrtc
var WebSocketSignaling = require('./signaling/out-of-band').websocket

var Scheduler = require('./scheduler').sequential

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:net'
})

// Server class

var Server = function () {
  if (!(this instanceof Server)) {
    return new Server()
  }
  // logging
  this.setLogger(winston)
  // first optional argument -> transports
  var transports = arguments[0]
  if (transports === undefined || typeof transports !== 'object') {
    this._log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectionListener = arguments[arguments.length - 1]
  // register connectionListener -- if this is a function
  if (typeof connectionListener === 'function') {
    this.once('connection', connectionListener)
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // register event listeners
  this._registerTransportEvents(this._transports, connectionListener)
  // event emitter
  events.EventEmitter.call(this)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // temp variable for curvecp debugging
  this._connected = false
  // done
  this._log.debug('created new net stream')
}

// Inherit EventEmitter
inherits(Server, events.EventEmitter)

Server.prototype.setLogger = function (logger) {
  this._log = winstonWrapper(logger)
  this._log.addMeta({
    module: '1tp:net:server'
  })
}

Server.prototype.listen = function () {
  // first optional argument -> listeningInfo
  var listeningInfo = arguments[0]
  if (listeningInfo === undefined || typeof listeningInfo !== 'object') {
    listeningInfo = []
  }
  // remove null elements
  listeningInfo = listeningInfo.filter(function (info) {
    return info !== null
  })
  // last optional argument -> callback
  var callback = arguments[arguments.length - 1]
  if (typeof callback === 'function') {
    this.once('listening', callback)
  }
  var self = this
  this.listenP(listeningInfo)
    .then(function (collectedListeningInfo) {
      self.emit('listening')
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

Server.prototype.listenP = function (listeningInfo) {
  // check listening info
  if (listeningInfo === undefined || typeof listeningInfo !== 'object') {
    listeningInfo = []
  }
  // remove null elements
  listeningInfo = listeningInfo.filter(function (info) {
    return info !== null
  })
  var self = this
  // create list of promises
  var listenPromises = this._transports.map(function (transport) {
    var transportListeningInfo = listeningInfo.find(function (listeningInfoInstance) {
      if (listeningInfoInstance.transportType === transport.transportType()) {
        return listeningInfoInstance
      }
    })
    if (transportListeningInfo) {
      self._log.debug('binding transport with specified listening info ' + JSON.stringify(transportListeningInfo))
    }
    return transport.listenP(transportListeningInfo)
      .catch(function (error) {
        // retry without transportListeningInfo
        if (transportListeningInfo !== undefined) {
          self._log.debug('binding transport with specified listening info failed, retrying without listening info')
          return transport.listenP()
        // else forward error
        } else {
          self._log.error(error)
          self._error(error)
        }
      })
  })
  // execute promises
  return Q.all(listenPromises)
    .then(function (collectedListeningInfo) {
      collectedListeningInfo = [].concat.apply([], collectedListeningInfo) // flatten multidimensional array
      self._log.debug('collected listening info ' + JSON.stringify(collectedListeningInfo))
      self._listeningInfo = collectedListeningInfo
      return collectedListeningInfo
    })
}

Server.prototype.address = function () {
  return this._listeningInfo
}

Server.prototype.close = function (callback) {
  if (typeof callback === 'function') {
    this.once('close', callback)
  }
  var self = this
  this.closeP()
    .then(function () {
      self._log.debug('all transports are closed')
      self.emit('close')
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

Server.prototype.closeP = function () {
  var closePromises = this._transports.map(function (transport) {
    return transport.closeP()
  })
  return Q.all(closePromises)
}

Server.prototype._registerTransportEvents = function (transports) {
  var self = this
  transports.forEach(function (transport) {
    transport.on('connection', self._onIncomingConnection())
    transport.on('error', function (error) {
      self._log.error(error)
      self._error(error)
    })
  })
}

Server.prototype._onIncomingConnection = function () {
  var self = this
  return function (stream, transport, peerConnectionInfo) {
    if (self._connected) {
      var connectionAvailableError = 'connection already available, not expecting creation of new connection'
      self._log.warn(connectionAvailableError)
    // self._error(connectionAvailableError)
    // return
    }
    self._log.debug('new incoming connection for transport ' + transport.transportType(), ', peerConnectionInfo = ' + JSON.stringify(peerConnectionInfo))
    /* TODO
     * for now, we only support one single transport connection per session
     * multiple transports will be added later on
     */
    var socket = new Socket(transport)
    socket.connectStream(stream)
    socket.remoteAddress = [peerConnectionInfo]
    self._connected = true

    self.emit('connection', socket)
  }
}

// Socket class

var Socket = function (transports) {
  if (!(this instanceof Socket)) {
    return new Socket(transports)
  }
  // logging
  this.setLogger(winston)
  // verify transports
  if (transports === undefined) {
    this._log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // init proxy stream
  ProxyStream.call(this)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new net socket')
}

inherits(Socket, ProxyStream)

Socket.prototype.setLogger = function (logger) {
  this._log = winstonWrapper(logger)
  this._log.addMeta({
    module: '1tp:net:socket'
  })
}

Socket.prototype.connect = function (connectionInfo, connectListener) {
  // verify if connectionInfo is defined
  if (connectionInfo === undefined) {
    var connectionInfoUndefinedError = 'incorrect args: connectionInfo is undefined'
    this._log.error(connectionInfoUndefinedError)
    this._error(connectionInfoUndefinedError)
  }
  // register connectionListener -- if this is a function
  if (typeof connectListener === 'function') {
    this.once('connect', connectListener)
  }
  // create array of connection infos
  connectionInfo = Array.isArray(connectionInfo) ? connectionInfo : [connectionInfo]
  // prepare connection attempts
  var self = this
  var connectionAttempts = []
  connectionInfo.forEach(function (endpointInfo) {
    var transport = self._transports.find(function (registeredTransport) {
      if (endpointInfo.transportType === registeredTransport.transportType()) {
        return registeredTransport
      }
    })
    if (!transport) {
      self._log.debug('could not find associated transport for connection info ' + JSON.stringify(endpointInfo))
      return
    }
    self._log.debug('preparing connection attempt to ' + JSON.stringify(endpointInfo))
    connectionAttempts.push({
      transport: transport,
      endpointInfo: endpointInfo
    })
  })
  var scheduler = new Scheduler()
  scheduler.connectP(connectionAttempts)
    .then(function (stream) {
      if (!stream) {
        var noConnectionError = 'could not establish connection with ' + JSON.stringify(connectionInfo)
        self._log.debug(noConnectionError)
        self._error(noConnectionError)
      // stream is found -- shout it out loud
      } else {
        self._log.debug('w00t ... connection established')
        self.connectStream(stream)
        self.remoteAddress = [stream.peerConnectionInfo]
        self.emit('connect')
      }
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

Socket.prototype.isConnected = function () {
  return (this._connectedStream !== undefined)
}

// factory functions

var createServer = function () {
  // first optional argument -> transports
  var transports = arguments[0]
  if (transports === undefined || typeof transports !== 'object') {
    _log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectionListener = arguments[arguments.length - 1]
  // create new server instance
  return new Server(transports, connectionListener)
}

var createConnection = function () {
  // mandator argument -> connectionInfo
  var connectionInfo = arguments[0]
  if (connectionInfo === undefined || typeof connectionInfo !== 'object') {
    _log.error('connectionInfo undefined')
    return
  }
  // first optional argument -> transports
  var transports = arguments[1]
  if (transports === undefined || typeof transports !== 'object') {
    _log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectListener = arguments[arguments.length - 1]
  // create socket and init connection handshake
  var socket = new Socket(transports)
  socket.connect(connectionInfo, connectListener)
  // done
  return socket
}

var _getDefaultTransports = function () {
  var transports = []
  // udp transport
  if (UdpTransport.isCompatibleWithRuntime()) {
    _log.debug('using UDP transport')
    transports.push(new UdpTransport())
  }
  // tcp transport
  if (TcpTransport.isCompatibleWithRuntime()) {
    _log.debug('using TCP transport')
    transports.push(new TcpTransport())
  }
  // turn+udp transport
  if (config.turnAddr !== undefined &&
    config.turnPort !== undefined &&
    config.turnUser !== undefined &&
    config.turnPass !== undefined &&
    config.onetpRegistrar !== undefined
  ) {
    var turnUdpConfigs = {
      turnServer: config.turnAddr,
      turnPort: config.turnPort,
      turnUsername: config.turnUser,
      turnPassword: config.turnPass,
      signaling: new WebSocketSignaling({
        url: config.onetpRegistrar
      })
    }
    if (TurnTransport.isCompatibleWithRuntime(turnUdpConfigs)) {
      _log.debug('using TURN+UDP transport')
      transports.push(new TurnTransport(turnUdpConfigs))
    }
  }
  // turn+tcp transport
  if (config.turnAddr !== undefined &&
    config.turnPort !== undefined &&
    config.turnUser !== undefined &&
    config.turnPass !== undefined &&
    config.onetpRegistrar !== undefined
  ) {
    var turnTcpConfigs = {
      turnServer: config.turnAddr,
      turnPort: config.turnPort,
      turnProtocol: new TurnProtocols.TCP(),
      turnUsername: config.turnUser,
      turnPassword: config.turnPass,
      signaling: new WebSocketSignaling({
        url: config.onetpRegistrar
      })
    }
    if (TurnTransport.isCompatibleWithRuntime(turnTcpConfigs)) {
      _log.debug('using TURN+TCP transport')
      transports.push(new TurnTransport(turnTcpConfigs))
    }
  }
  // webrtc transport
  if (WebRtcTransport.isCompatibleWithRuntime() &&
    config.onetpRegistrar !== undefined
  ) {
    // add stun servers
    var iceServers = freeice()
    // add turn servers
    if (config.turnAddr !== undefined &&
      config.turnPort !== undefined &&
      config.turnUser !== undefined &&
      config.turnPass !== undefined
    ) {
      var turnUrl = {
        url: 'turn:' + config.turnAddr + ':' + config.turnPort,
        username: config.turnUser,
        credential: config.turnPass
      }
      iceServers.push(turnUrl)
    }
    var webrtcConfig = {
      config: { iceServers: iceServers },
      signaling: new WebSocketSignaling({
        url: config.onetpRegistrar
      })
    }
    _log.debug('using WebRtc transport')
    transports.push(new WebRtcTransport(webrtcConfig))
  }
  return transports
}

module.exports = {
  createConnection: createConnection,
  createServer: createServer,
  connect: createConnection,
  Server: Server,
  Socket: Socket
}
