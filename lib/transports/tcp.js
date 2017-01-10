'use strict'

var AbstractTransport = require('./abstract')
var Args = require('args-js')
var merge = require('merge')
var net = require('net')
var nicAddresses = require('./addresses/nic')
var NetStringStream = require('./session/netstring')
var OneTpError = require('../error')
var runtime = require('mm-runtime-info')
var util = require('util')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

/**
 * Tcp transport
 *
 * @constructor
 * @fires TcpTransport#listening
 * @fires TcpTransport#connection
 * @fires TcpTransport#connect
 * @fires TcpTransport#error
 * @fires TcpTransport#close
 */
function TcpTransport (args) {
  if (!(this instanceof TcpTransport)) {
    return new TcpTransport(args)
  }
  AbstractTransport.call(this)
  // verify runtime compatibility
  if (!TcpTransport.isCompatibleWithRuntime()) {
    var errorMsg = 'TCP transport cannot be used on this runtime'
    this._error(errorMsg)
  }
  // logging
  this._log = winstonWrapper(winston)
  this._log.addMeta({
    module: '1tp:transports:tcp'
  })
  // init
  this._args = merge(Object.create(TcpTransport.DEFAULTS), args)
  this._connectingSockets = {}
  // create listening socket
  this._createServerSocket(this._args)
  // done
  this._log.debug('created tcp transport with args ' + JSON.stringify(this._args))
}

// Inherit from abstract transport
util.inherits(TcpTransport, AbstractTransport)

TcpTransport.DEFAULTS = {
  allowHalfOpen: false,
  pauseOnConnect: false,
  connectTimeout: 100
}

TcpTransport.isCompatibleWithRuntime = function () {
  return !runtime.isBrowser() && !runtime.isCordovaApp()
}

TcpTransport.prototype._createServerSocket = function (socketOpts) {
  var self = this
  this._muteSocketErrorListeners = false
  this._server = net.createServer(socketOpts)
  this._server.on('connection', this._onConnection())
  this._server.on('error', function (error) {
    if (self._muteSocketErrorListeners) {
      return
    }
    self._log.error(error)
    self._error(error)
  })
}

TcpTransport.prototype._onConnection = function () {
  var self = this
  return function (socket) {
    var netstring = new NetStringStream()
    netstring.attachToEncoder(socket)
    netstring.attachToDecoder(socket)
    var peerConnectionInfo = {
      transportType: self.transportType(),
      transportInfo: {
        address: socket.remoteAddress,
        port: socket.remotePort
      }
    }
    self._fireConnectionEvent(netstring, self, peerConnectionInfo)
  }
}

TcpTransport.prototype.transportType = function () {
  return 'tcp'
}

TcpTransport.prototype.listen = function () {
  // parse args
  var functionArgs = new Args([
    { listeningInfo: Args.OBJECT | Args.Optional },
    { onSuccess: Args.FUNCTION | Args.Optional },
    { opFailure: Args.FUNCTION | Args.Optional }
  ], arguments)
  var listeningInfo = functionArgs.listeningInfo
  var onSuccess = functionArgs.onSuccess
  var onFailure = functionArgs.onFailure
  // start
  this._log.debug('listen to ' + JSON.stringify(listeningInfo))
  var port = 0
  var address = '0.0.0.0'
  if (listeningInfo !== undefined) {
    // verify listeningInfo
    if (listeningInfo.transportType !== this.transportType()) {
      var transportTypeError = 'incorrect listeningInfo: unexpected transportType -- ignoring request'
      this._log.error(transportTypeError)
      this._error(transportTypeError, onFailure)
      return
    }
    if (listeningInfo.transportInfo === undefined) {
      var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
      this._log.error(transportInfoUndefined)
      this._error(transportInfoUndefined, onFailure)
      return
    }
    port = (listeningInfo.transportInfo.port !== undefined) ? listeningInfo.transportInfo.port : port
    address = (listeningInfo.transportInfo.address !== undefined) ? listeningInfo.transportInfo.address : address
  }
  var self = this
  // prepare to process errors during bind operation
  var onBindError = function (error) {
    // when listeningInfo was undefined -> error
    if (listeningInfo === undefined) {
      self._createServerSocket(self._args)
      self._error(error, onFailure)
    // when specified address was not available, try again without address hint
    } else if (error.code === 'EADDRNOTAVAIL') {
      // try again, but ignore address hint
      self._createServerSocket(self._args)
      var listeningInfoWithoutAddress = merge(true, listeningInfo)
      delete listeningInfoWithoutAddress.transportInfo.address
      self.listen(listeningInfoWithoutAddress, onSuccess, onFailure)
    // when specified port could not be accessed, try again without port hint
    } else if (error.code === 'EACCES') {
      // try again, but ignore port hint
      self._createServerSocket(self._args)
      var listeningInfoWithoutPort = merge(true, listeningInfo)
      delete listeningInfoWithoutPort.transportInfo.port
      self.listen(listeningInfoWithoutPort, onSuccess, onFailure)
    }
  }
  // mute existing error listeners during bind operation
  this._muteSocketErrorListeners = true
  // register temp error listener
  this._server.once('error', onBindError)
  // bind tcp server socket
  this._server.listen(port, address, function () {
    // drop error listener
    self.removeListener('error', onBindError)
    // unmute existing error listeners
    self._muteSocketErrorListeners = true
    // create connection info
    var myConnectionInfo = {
      transportType: self.transportType(),
      transportInfo: {
        // address will be added below
        port: self._server.address().port
      },
      version: self.version
    }
    // if address was specified in listening info, then reuse it
    if (address !== '0.0.0.0' && address !== '::') {
      myConnectionInfo.transportInfo.address = address
      self._myConnectionInfo = myConnectionInfo
      self._log.debug('tcp socket bound, connectionInfo = ' + JSON.stringify(myConnectionInfo))
      self._fireListeningEvent(myConnectionInfo, onSuccess)
    } else {
      // otherwise, retrieve local ip address
      nicAddresses.getIpAddressesP()
        .then(function (addresses) {
          var myConnectionInfos = addresses.map(function (localAddress) {
            var connectionInfo = {
              transportType: myConnectionInfo.transportType,
              transportInfo: {
                address: localAddress,
                // INVARIANT thomasdelaet: port numbers must be the same when creating separate transport info instances for different local ipAddresses
                port: myConnectionInfo.transportInfo.port
              },
              version: self.version
            }
            return connectionInfo
          })
          self._log.debug('tcp socket bound, connectionInfo = ' + JSON.stringify(myConnectionInfos))
          self._fireListeningEvent(myConnectionInfos, onSuccess)
        })
        .catch(function (error) {
          self._error(error, onFailure)
        })
    }
  })
}

TcpTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  this._log.debug('connect to ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- ignoring request'
    this._log.error(transportTypeError)
    this._error(transportTypeError, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo === undefined) {
    var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
    this._log.error(transportInfoUndefined)
    this._error(transportInfoUndefined, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo.address === undefined || peerConnectionInfo.transportInfo.port === undefined) {
    var addressError = 'incorrect connectionInfo: address and/or port attribute is undefined'
    this._log.error(addressError)
    this._error(addressError, onFailure)
    return
  }
  // establish connection
  var self = this
  var socket = net.connect(peerConnectionInfo.transportInfo.port, peerConnectionInfo.transportInfo.address, function () {
    self._log.debug('connection established with endpoint ' + JSON.stringify(peerConnectionInfo))
    // stop and remove timer
    clearTimeout(socket._1tpConnectionTimeout)
    delete socket._1tpConnectionTimeout
    // delete socket from connectingSockets
    delete self._connectingSockets[peerConnectionInfo.transportInfo]
    // create netstring stream + pipe socket to this stream
    var netstring = new NetStringStream()
    netstring.attachToEncoder(socket)
    netstring.attachToDecoder(socket)
    // fire connect event
    self._fireConnectEvent(netstring, peerConnectionInfo, onSuccess)
  })
  socket.on('error', function (error) {
    // stop and remove connection timer if present
    if (socket._1tpConnectionTimeout) {
      // stop and remove timer
      clearTimeout(socket._1tpConnectionTimeout)
      delete socket._1tpConnectionTimeout
      // delete socket from connectingSockets
      delete self._connectingSockets[peerConnectionInfo.transportInfo]
    }
    self._log.error(error)
    self._error(error, onFailure)
  })
  // store socket in case the scheduler wants to abort it
  this._connectingSockets[peerConnectionInfo.transportInfo] = socket
  // set timeout
  socket._1tpConnectionTimeout = setTimeout(function () {
    // abort handshake init
    self.abort(
      peerConnectionInfo,
      function () {
        // create and display error message
        var handshakeAbortedMessage = 'handshake aborted'
        self._log.error(handshakeAbortedMessage)
        // when ready, fire error event
        self._error(new OneTpError(OneTpError.CODES.handshakeAborted, handshakeAbortedMessage), onFailure)
      },
      onFailure
    )
  }, this._args.connectTimeout)
}

TcpTransport.prototype.abort = function (peerConnectionInfo, onSuccess, onFailure) {
  this._log.debug('aborting handshake with ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- Ignoring request'
    this._log.error(transportTypeError)
    this._error(transportTypeError, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo === undefined) {
    var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
    this._log.error(transportInfoUndefined)
    this._error(transportInfoUndefined, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo.address === undefined || peerConnectionInfo.transportInfo.port === undefined) {
    var addressError = 'incorrect connectionInfo: address and/or port attribute is undefined'
    this._log.error(addressError)
    this._error(addressError, onFailure)
    return
  }
  var socket = this._connectingSockets[peerConnectionInfo.transportInfo]
  if (!socket) {
    var noSocketMessage = 'cannot find socket for connectionInfo ' + JSON.stringify(peerConnectionInfo.transportInfo)
    this._log.error(noSocketMessage)
    this._error(new OneTpError(OneTpError.CODES.nothingToAbort, noSocketMessage), onFailure)
    return
  }
  var self = this
  // once socket is destroyed
  socket.once('close', function () {
    // stop and remove timer
    clearTimeout(socket._1tpConnectionTimeout)
    delete socket._1tpConnectionTimeout
    // delete socket from connectingSockets
    delete self._connectingSockets[peerConnectionInfo.transportInfo]
    // done
    onSuccess()
  })
  // destroy socket
  socket.destroy()
}

TcpTransport.prototype.close = function (onSuccess, onFailure) {
  var self = this
  this._server.close(function () {
    self._fireCloseEvent(onSuccess)
  })
}

module.exports = TcpTransport
