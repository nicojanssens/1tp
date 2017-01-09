'use strict'

var Args = require('args-js')
var config = require('./config')
var events = require('events')
var freeice = require('freeice')
var inherits = require('util').inherits
var merge = require('merge')
var myUtils = require('./utils')
var ProxyStream = require('./stream')
var Q = require('q')
var scheduler = require('./scheduler')
var TurnProtocols = require('turn-js').transports
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

var onetpTransports = require('./transports')
var TcpTransport = onetpTransports.tcp
var TurnTransport = onetpTransports.turn
var UdpTransport = onetpTransports.udp
var WebRtcTransport = onetpTransports.webrtc
var WebSocketSignaling = require('./signaling/out-of-band').websocket

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
  // parse args
  var functionArgs = new Args([
  	{ transports: Args.ARRAY | Args.Optional },
  	{ connectionListener: Args.FUNCTION | Args.Optional }
  ], arguments)
  // first optional argument -> transports
  var transports = functionArgs.transports
  if (transports === undefined) {
    this._log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectionListener = functionArgs.connectionListener
  // register connectionListener -- if not undefined
  if (connectionListener !== undefined) {
    this.on('connection', connectionListener)
  }
  // create array if single elem
  this._transports = Array.isArray(transports) ? transports : [transports]
  // register event listeners
  this._registerTransportEvents(this._transports, connectionListener)
  // event emitter
  events.EventEmitter.call(this)
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // keep track of connections
  this._connections = {}
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
  // parse args
  var functionArgs = new Args([
    { listeningInfo: Args.OBJECT | Args.Optional },
    { callback: Args.FUNCTION | Args.Optional }
  ], arguments)
  // first optional argument -> listeningInfo
  var listeningInfo = functionArgs.listeningInfo
  if (listeningInfo === undefined) {
    listeningInfo = []
  }
  // remove null elements
  listeningInfo = listeningInfo.filter(function (info) {
    return info !== null
  })
  // last optional argument -> callback
  var callback = functionArgs.callback
  if (callback !== undefined) {
    this.once('listening', callback)
  }
  var self = this
  this.listenP(listeningInfo)
    .then(function (collectedListeningInfo) {
      self._log.debug('server can be reached at ' + JSON.stringify(collectedListeningInfo))
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
    self._log.debug('new incoming ' + transport.transportType() + ' connection available, peerConnectionInfo = ' + JSON.stringify(peerConnectionInfo))
    // create socket and fire connection event
    var socket = new Socket([transport])
    socket.connectStream(stream)
    socket.remoteAddress = peerConnectionInfo
    socket._waitForHandshakeP()
      .then(function (connected) {
        if (connected) {
          self._log.debug('succesfully executed handshake over ' + transport.transportType() + ' connection with peerConnectionInfo = ' + JSON.stringify(peerConnectionInfo))
          self._log.debug('firing CONNECTION event')
          self.emit('connection', socket)
        } else {
          self._log.debug('discarding ' + transport.transportType() + ' connection with peerConnectionInfo = ' + JSON.stringify(peerConnectionInfo))
        }
      })
      .catch(function (error) {
        self._log.debug(error)
        self._error(error)
      })
  }
}

// Socket class

var Socket = function () {
  if (!(this instanceof Socket)) {
    return new Socket(transports)
  }
  var functionArgs = new Args([
    { transports: Args.ARRAY | Args.Optional },
    { args: Args.OBJECT | Args.Optional }
  ], arguments)
  // init
  this._args = merge(Object.create(Socket.DEFAULTS), functionArgs.args)
  var transports = functionArgs.transports
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
  // init connection scheduler
  if (this._args.parallelConnectionSetup) {
    var ParallelScheduler = scheduler.parallel
    this._connectionScheduler = new ParallelScheduler()
  } else {
    var SequentialScheduler = scheduler.sequential
    this._connectionScheduler = new SequentialScheduler()
  }
  // register _error handler
  myUtils.mixinEventEmitterErrorFunction(this)
  // done
  this._log.debug('created new net socket')
}

inherits(Socket, ProxyStream)

Socket.DEFAULTS = {
  parallelConnectionSetup: false
}

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
  var transportStream
  this._connectionScheduler.connectP(connectionAttempts)
    .then(function (stream) {
      if (!stream) {
        var noConnectionError = 'could not establish connection with ' + JSON.stringify(connectionInfo)
        self._log.debug(noConnectionError)
        throw new Error(noConnectionError)
      // stream is found -- shout it out loud
      } else {
        self._log.debug('w00t ... connection established')
        transportStream = stream
      }
    })
    .then(function () {
      self._log.debug('executing PING-PONG handshake')
      self.connectStream(transportStream)
      self.remoteAddress = transportStream.peerConnectionInfo
      return self._initHandshakeP()
    })
    .then(function () {
      self._log.debug('firing CONNECT event')
      self.emit('connect')
    })
    .catch(function (error) {
      self._log.error(error)
      self._error(error)
    })
}

Socket.prototype.isConnected = function () {
  return (this._connectedStream !== undefined)
}

Socket.prototype._connectTimeout = function () {
  var timeouts = this._transports.map(function (transport) {
    return transport._args.connectTimeout
  })
  return this._connectionScheduler.calculateConnectTimeout(timeouts)
}

// factory functions

var createServer = function () {
  var functionArgs = new Args([
    { transports: Args.ARRAY | Args.Optional },
    { connectionListener: Args.FUNCTION | Args.Optional }
  ], arguments)
  // first optional argument -> transports
  var transports = functionArgs.transports
  if (transports === undefined) {
    _log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // last optional argument -> callback
  var connectionListener = functionArgs.connectionListener
  // create new server instance
  return new Server(transports, connectionListener)
}

var createConnection = function () {
  var functionArgs = new Args([
    { connectionInfo: Args.OBJECT | Args.Required },
    { transports: Args.ARRAY | Args.Optional },
    { opts: Args.OBJECT | Args.Optional },
    { connectListener: Args.FUNCTION | Args.Optional }
  ], arguments)
  // mandator argument -> connectionInfo
  var connectionInfo = functionArgs.connectionInfo
  if (connectionInfo === undefined) {
    _log.error('connectionInfo undefined')
    return
  }
  // first optional argument -> transports
  var transports = functionArgs.transports
  if (transports === undefined) {
    _log.debug('no transports defined, using default configuration')
    transports = _getDefaultTransports()
  }
  // second optional argument -> opts
  var opts = functionArgs.opts
  if (opts === undefined) {
    opts = {}
  }
  // last optional argument -> callback
  var connectListener = functionArgs.connectListener
  // create socket and init connection handshake
  var socket = new Socket(transports, opts)
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
  // turn transport
  if (config.turnAddr !== undefined &&
    config.turnPort !== undefined &&
    config.turnUser !== undefined &&
    config.turnPass !== undefined &&
    config.onetpRegistrar !== undefined
  ) {
    // turn+tcp
    var turnConfig = {
      turnServer: config.turnAddr,
      turnPort: config.turnPort,
      turnUsername: config.turnUser,
      turnPassword: config.turnPass,
      turnProtocol: new TurnProtocols.TCP(),
      signaling: new WebSocketSignaling({
        url: config.onetpRegistrar
      })
    }
    if (TurnTransport.isCompatibleWithRuntime(turnConfig)) {
      _log.debug('using TURN+TCP transport')
      transports.push(new TurnTransport(turnConfig))
    } else {
      // turn+udp
      turnConfig.turnProtocol = new TurnProtocols.UDP()
      if (TurnTransport.isCompatibleWithRuntime(turnConfig)) {
        _log.debug('using TURN+UDP transport')
        transports.push(new TurnTransport(turnConfig))
      }
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
