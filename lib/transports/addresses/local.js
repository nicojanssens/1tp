'use strict'

var net = require('net')
var Q = require('q')
var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:transports:addresses:local'
})

function getIpAddress (onSuccess, onFailure) {
  var socket = net.createConnection(80, 'www.google.com')
  socket.on('connect', function () {
    onSuccess(socket.address().address)
    socket.end()
  })
  socket.on('error', function (error) {
    onFailure(error)
  })
}

function getIpAddressP () {
  var deferred = Q.defer()
  getIpAddress(
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

exports.getIpAddress = getIpAddress
exports.getIpAddressP = getIpAddressP
