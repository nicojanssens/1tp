'use strict'

var publicIp = require('public-ip')
var Q = require('q')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:transports:addresses:public'
})

// returns node's public IP address -- i.e. address visible beyond the latest GW
function getIpAddressP () {
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

function getIpAddress (onSuccess, onFailure) {
  getIpAddressP()
    .then(function (address) {
      return onSuccess(address)
    })
    .catch(function (error) {
      return onFailure(error)
    })
}

exports.getIpAddress = getIpAddress
exports.getIpAddressP = getIpAddressP
