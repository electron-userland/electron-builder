'use strict';

var electron;
try {
  electron = require('electron');
} catch (e) {
  electron = null;
}

var log                      = require('./lib/log');
var transportConsole         = require('./lib/transports/console');
var transportFile            = require('./lib/transports/file');
var transportLogS            = require('./lib/transports/log-s');
var transportRendererConsole = require('./lib/transports/renderer-console');

var transports = {
  console: transportConsole,
  file: transportFile,
  logS: transportLogS,
  rendererConsole: transportRendererConsole
};

module.exports = {
  transports: transports,

  error:   log.bind(null, transports, 'error'),
  warn:    log.bind(null, transports, 'warn'),
  info:    log.bind(null, transports, 'info'),
  verbose: log.bind(null, transports, 'verbose'),
  debug:   log.bind(null, transports, 'debug'),
  silly:   log.bind(null, transports, 'silly'),
  log:     log.bind(null, transports, 'info')
};

module.exports.default = module.exports;

if (electron && electron.ipcMain) {
  electron.ipcMain.on('__ELECTRON_LOG__', onRendererLog);
  var appName = electron.app.getName();
  if (appName !== 'Electron') {
    transportFile.appName = appName;
  }
}

function onRendererLog(event, data) {
  if (Array.isArray(data)) {
    data.unshift(transports);
    log.apply(null, data);
  }
}
