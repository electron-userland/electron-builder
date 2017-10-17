'use strict';

var format = require('../format');

transport.level  = 'silly';
transport.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

module.exports = transport;

function transport(msg) {
  var text = format.format(msg, transport.format);
  if (console[msg.level]) {
    console[msg.level](text);
  } else {
    console.log(text);
  }
}

