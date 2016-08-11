'use strict'

var publicIp = require('public-ip')
var net = require('net')
var os = require('os')
var Q = require('q')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:nat:ip-addresses'
})

function getLocalIpAddress (onSuccess, onFailure) {
  var socket = net.createConnection(80, 'www.google.com')
  socket.on('connect', function () {
    onSuccess(socket.address().address)
    socket.end()
  })
  socket.on('error', function (error) {
    onFailure(error)
  })
}

function getLocalIpAddressP () {
  var deferred = Q.defer()
  getLocalIpAddress(
    function (address) {
      _log.debug('found private active IP network address ' + address)
      deferred.resolve(address)
    },
    function (error) {
      _log.error('could not find private active IP network address.' + error)
      deferred.reject(error)
    }
  )
  return deferred.promise
}

// returns node's public IP address -- i.e. address visible beyond the latest GW
function getPublicIpAddressP () {
  _log.debug('get public IP address request')
  var deferred = Q.defer()
  publicIp(function (error, ip) {
    if (error) {
      _log.error('could not determine public IP address. ' + error)
      deferred.reject(error)
    } else {
      _log.debug('retrieved public IP address ' + ip)
      deferred.resolve(ip)
    }
  })
  return deferred.promise
}

function getPublicIpAddress (onSuccess, onFailure) {
  getPublicIpAddressP()
    .then(function (address) {
      return onSuccess(address)
    })
    .catch(function (error) {
      return onFailure(error)
    })
}

// returns all available IPv4 NIC addresses
function getAllLocalIpv4Addresses () {
  var ifaces = os.networkInterfaces()
  var addresses = []
  for (var ifname in ifaces) {
    ifaces[ifname].forEach(function (iface) {
      if (iface.family !== 'IPv4' || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return
      }
      addresses.push(iface.address)
    })
  }
  return addresses
}

exports.getLocalIpAddress = getLocalIpAddress
exports.getLocalIpAddressP = getLocalIpAddressP
exports.getPublicIpAddress = getPublicIpAddress
exports.getPublicIpAddressP = getPublicIpAddressP
exports.getAllLocalIpv4Addresses = getAllLocalIpv4Addresses
