'use strict';

var BrowserWindow;
try {
  BrowserWindow = require('electron').BrowserWindow;
} catch (e) {
  BrowserWindow = null;
}

var format = require('../format');

transport.level  = BrowserWindow ? 'silly' : false;
transport.format = '[{h}:{i}:{s}.{ms}] {text}';

module.exports = transport;

function transport(msg) {
  if (!BrowserWindow) return;

  var text = format.format(msg, transport.format);
  BrowserWindow.getAllWindows().forEach(function(wnd) {
    wnd.webContents.send('__ELECTRON_LOG_RENDERER__', msg.level, text);
  });
}
