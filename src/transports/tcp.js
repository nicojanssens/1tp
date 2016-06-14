'use strict'

var AbstractTransport = require('./abstract')
var ipAddresses = require('../nat/ip-addresses')
var merge = require('merge')
var net = require('net')
var NetStringStream = require('./streams/netstring')
var util = require('util')

var debug = require('debug')
var debugLog = debug('1tp:transports:tcp')
var errorLog = debug('1tp:transports:tcp:error')

/**
 * Tcp transport
 *
 * @constructor
 * @fires TcpTransport#active
 * @fires TcpTransport#connection
 * @fires TcpTransport#connect
 * @fires TcpTransport#error
 * @fires TcpTransport#close
 */
function TcpTransport (socketOpts) {
  if (!(this instanceof TcpTransport)) {
    return new TcpTransport(socketOpts)
  }
  var opts = merge(Object.create(TcpTransport.DEFAULTS), socketOpts)
  this._createServerSocket(opts)
  AbstractTransport.call(this)
  // done
  debugLog('created tcp transport with args ' + JSON.stringify(opts))
}

// Inherit EventEmitter
util.inherits(TcpTransport, AbstractTransport)

TcpTransport.DEFAULTS = {
  allowHalfOpen: false,
  pauseOnConnect: false
}

TcpTransport.prototype._createServerSocket = function (socketOpts) {
  var self = this
  this._server = net.createServer(socketOpts)
  this._server.on('connection', this._onConnection())
  this._server.on('error', function (error) {
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

TcpTransport.prototype.activate = function (activationInfo, onSuccess, onFailure) {
  var port, address
  if (activationInfo !== undefined) {
    // verify activationInfo
    if (activationInfo.transportType !== this.transportType()) {
      var transportTypeError = 'incorrect activationInfo: unexpected transportType -- ignoring request'
      errorLog(transportTypeError)
      this._error(transportTypeError, onFailure)
      return
    }
    if (activationInfo.transportInfo === undefined) {
      var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
      errorLog(transportInfoUndefined)
      this._error(transportInfoUndefined, onFailure)
      return
    }
    port = activationInfo.transportInfo.port
    address = activationInfo.transportInfo.address
  }

  var self = this
  // configure listeners
  if (this._server.listeners('listening').length === 0) {
    this._server.on('listening', function () {
      // create connection info
      var myConnectionInfo = {
        transportType: self.transportType(),
        transportInfo: {
          // address will be added below
          port: self._server.address().port
        }
      }
      // if address was specified in activation info, then reuse it
      if (address) {
        myConnectionInfo.transportInfo.address = self._server.address().address
        self._myConnectionInfo = myConnectionInfo
        self._fireActiveEvent(myConnectionInfo, onSuccess)
      } else {
        // otherwise, retrieve local ip address
        var myConnectionInfos = ipAddresses.getAllLocalIpv4Addresses().map(function (localAddress) {
          var connectionInfo = {
            transportType: myConnectionInfo.transportType,
            transportInfo: {
              address: localAddress,
              port: myConnectionInfo.transportInfo.port
            }
          }
          return connectionInfo
        })
        self._fireActiveEvent(myConnectionInfos, onSuccess)
      }
    })
  }
  // fire up
  port = (port === undefined) ? 0 : port 
  debugLog('listening on address:' + address + ', port:' + port)
  this._server.listen(port, address)
}

TcpTransport.prototype.connect = function (peerConnectionInfo, onSuccess, onFailure) {
  debugLog('connect to ' + JSON.stringify(peerConnectionInfo))
  // verify peerConnectionInfo
  if (peerConnectionInfo.transportType !== this.transportType()) {
    var transportTypeError = 'incorrect connectionInfo: unexpected transportType -- ignoring request'
    errorLog(transportTypeError)
    this._error(transportTypeError, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo === undefined) {
    var transportInfoUndefined = 'incorrect connectionInfo: transportInfo is undefined'
    errorLog(transportInfoUndefined)
    this._error(transportInfoUndefined, onFailure)
    return
  }
  if (peerConnectionInfo.transportInfo.address === undefined || peerConnectionInfo.transportInfo.port === undefined) {
    var addressError = 'incorrect connectionInfo: address and/or port attribute is undefined'
    errorLog(addressError)
    this._error(addressError, onFailure)
    return
  }
  // establish connection
  var self = this
  var socket = net.connect(peerConnectionInfo.transportInfo.port, peerConnectionInfo.transportInfo.address, function () {
    var netstring = new NetStringStream()
    netstring.attachToEncoder(socket)
    netstring.attachToDecoder(socket)
    self._fireConnectEvent(netstring, peerConnectionInfo, onSuccess)
  })
  socket.on('error', function (error) {
    self._error(error, onFailure)
  })
}

TcpTransport.prototype.close = function (onSuccess, onFailure) {
  var self = this
  this._server.close(function () {
    self._fireCloseEvent(onSuccess)
  })
}

module.exports = TcpTransport
