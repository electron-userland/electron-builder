'use strict';

var format = require('../format');

transport.level  = 'silly';
transport.format = formatFn;

module.exports = transport;

function transport(msg) {
  var text = format.format(msg, transport.format);
  if (console[msg.level]) {
    console[msg.level](text);
  } else {
    console.log(text);
  }
}

function formatFn(msg) {
  var time =
    format.pad(msg.date.getHours()) + ':' +
    format.pad(msg.date.getMinutes()) + ':' +
    format.pad(msg.date.getSeconds()) + ':' +
    format.pad(msg.date.getMilliseconds(), 4);

  return '[' + time + '] [' + msg.level + '] ' +
    format.stringifyArray(msg.data);
}