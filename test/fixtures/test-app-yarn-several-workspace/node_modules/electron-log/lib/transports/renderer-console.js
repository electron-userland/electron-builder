'use strict';

var BrowserWindow;
try {
  BrowserWindow = require('electron').BrowserWindow;
} catch (e) {
  BrowserWindow = null;
}

var format = require('../format');

transport.level  = BrowserWindow ? 'silly' : false;
transport.format = formatFn;

module.exports = transport;

function transport(msg) {
  if (!BrowserWindow) return;

  var text = format.format(msg, transport.format);
  BrowserWindow.getAllWindows().forEach(function(wnd) {
    wnd.webContents.send('__ELECTRON_LOG_RENDERER__', msg.level, text);
  });
}

function formatFn(msg) {
  var time =
        format.pad(msg.date.getHours()) + ':' +
        format.pad(msg.date.getMinutes()) + ':' +
        format.pad(msg.date.getSeconds()) + ':' +
        format.pad(msg.date.getMilliseconds(), 4);

  return '[' + time + '] ' + format.stringifyArray(msg.data);
}