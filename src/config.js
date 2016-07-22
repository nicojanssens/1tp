'use strict'

var winston = require('winston')
var winstonWrapper = require('winston-meta-wrapper')

var _log = winstonWrapper(winston)
_log.addMeta({
  module: '1tp:config'
})

var turnAddr, turnPort, turnUser, turnPass, onetpRegistrar

// check if config.json can be found, and parse it's values
try {
  var config = require('../config.json')
  turnAddr = config.turn.addr
  turnPort = config.turn.port
  turnUser = config.turn.username
  turnPass = config.turn.password
  onetpRegistrar = config.registrar
  _log.debug('config.json found, values = ' + JSON.stringify(config))
} catch (error) {
  _log.debug('could not find config.json')
}
turnAddr = (turnAddr === undefined) ? process.env.TURN_ADDR : turnAddr
turnPort = (turnPort === undefined) ? process.env.TURN_PORT : turnPort
turnUser = (turnUser === undefined) ? process.env.TURN_USER : turnUser
turnPass = (turnPass === undefined) ? process.env.TURN_PASS : turnPass
onetpRegistrar = (onetpRegistrar === undefined) ? process.env.ONETP_REGISTRAR : onetpRegistrar

_log.debug('turnAddr = ' + turnAddr)
_log.debug('turnPort = ' + turnPort)
_log.debug('turnUser = ' + turnUser)
_log.debug('turnPass = ' + turnPass)
_log.debug('onetpRegistrar = ' + onetpRegistrar)

module.exports.turnAddr = turnAddr
module.exports.turnPort = turnPort
module.exports.turnUser = turnUser
module.exports.turnPass = turnPass
module.exports.onetpRegistrar = onetpRegistrar
