'use strict'

var debug = require('debug')
var debugLog = debug('1tp:config')

var turnAddr, turnPort, turnUser, turnPass, onetpRegistrar

// check if config.json can be found, and parse it's values
try {
  var config = require('../config.json')
  turnAddr = config.turn.addr
  turnPort = config.turn.port
  turnUser = config.turn.username
  turnPass = config.turn.password
  onetpRegistrar = config.registrar
  debugLog('config.json found, values = ' + JSON.stringify(config))
} catch (error) {
  debugLog('could not find config.json')
}
turnAddr = (turnAddr === undefined) ? process.env.TURN_ADDR : turnAddr
turnPort = (turnPort === undefined) ? process.env.TURN_PORT : turnPort
turnUser = (turnUser === undefined) ? process.env.TURN_USER : turnUser
turnPass = (turnPass === undefined) ? process.env.TURN_PASS : turnPass
onetpRegistrar = (onetpRegistrar === undefined) ? process.env.ONETP_REGISTRAR : onetpRegistrar

debugLog('turnAddr = ' + turnAddr)
debugLog('turnPort = ' + turnPort)
debugLog('turnUser = ' + turnUser)
debugLog('turnPass = ' + turnPass)
debugLog('onetpRegistrar = ' + onetpRegistrar)

module.exports.turnAddr = turnAddr
module.exports.turnPort = turnPort
module.exports.turnUser = turnUser
module.exports.turnPass = turnPass
module.exports.onetpRegistrar = onetpRegistrar
