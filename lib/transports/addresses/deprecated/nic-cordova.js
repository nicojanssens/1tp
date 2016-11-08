'use strict'

var ip = require('ip')
var Q = require('q')
var winston = require('winston-debug')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:transports:addresses:nic:cordova'
})

_log.debug('using nic-cordova')

function getIpAddresses (onSuccess, onFailure) {
  var addresses = []
  networkinterface.getIPAddress(
    function (address) {
      if (!ip.isV4Format(address)) {
        // skip over non-ipv4 addresses
        return
      }
      addresses.push(address)
      _log.debug('retrieved nic IP addresses ' + JSON.stringify(addresses))
      onSuccess(addresses)
    }
  )
}

function getIpAddressesP () {
  var deferred = Q.defer()
  getIpAddresses(
    function (addresses) {
      _log.debug('found nic IP addresses ' + JSON.stringify(addresses))
      deferred.resolve(addresses)
    },
    function (error) {
      _log.error('could not find nic IP: ' + error)
      deferred.reject(error)
    }
  )
  return deferred.promise
}

exports.getIpAddresses = getIpAddresses
exports.getIpAddressesP = getIpAddressesP
