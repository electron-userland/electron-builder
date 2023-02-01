// jshint -W040
'use strict';

var LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];

module.exports = log;

function log(transports, level, text) {
  var data = Array.prototype.slice.call(arguments, 2);

  var msg = {
    data: data,
    date: new Date(),
    level: level
  };

  for (var i in transports) {
    // jshint -W089
    if (!transports.hasOwnProperty(i) || typeof transports[i] !== 'function') {
      continue;
    }

    var transport = transports[i];

    if (transport === false || !compareLevels(transport.level, level)) {
      continue;
    }

    if (transport.level === false) continue;

    transport.call(null, msg);
  }
}

function compareLevels(passLevel, checkLevel) {
  var pass = LEVELS.indexOf(passLevel);
  var check = LEVELS.indexOf(checkLevel);
  if (check === -1 || pass === -1) {
    return true;
  }
  return check <= pass;
}