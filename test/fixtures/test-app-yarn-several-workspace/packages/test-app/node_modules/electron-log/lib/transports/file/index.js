'use strict';

var fs               = require('fs');
var EOL              = require('os').EOL;
var format           = require('../../format');
var consoleTransport = require('../console');
var findLogPath      = require('./find-log-path');

transport.findLogPath  = findLogPath;
transport.format       = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
transport.level        = 'warn';
transport.maxSize      = 1024 * 1024;
transport.streamConfig = undefined;

module.exports = transport;

function transport(msg) {
  var text = format.format(msg, transport.format) + EOL;

  if (transport.stream === undefined) {
    initSteamConfig();
    openStream();
  }

  if (transport.level === false) {
    return;
  }

  var needLogRotation = transport.maxSize > 0 &&
    getStreamSize(transport.stream) > transport.maxSize;

  if (needLogRotation) {
    archiveLog(transport.stream);
    openStream();
  }

  transport.stream.write(text);
}

function initSteamConfig() {
  transport.file = transport.file || findLogPath(transport.appName);

  if (!transport.file) {
    transport.level = false;
    logConsole('Could not set a log file');
  }
}

function openStream() {
  if (transport.level === false) {
    return;
  }

  transport.stream = fs.createWriteStream(
    transport.file,
    transport.streamConfig || { flags: 'a' }
  );
}

function getStreamSize(stream) {
  if (!stream) {
    return 0;
  }

  if (stream.logSizeAtStart === undefined) {
    try {
      stream.logSizeAtStart = fs.statSync(stream.path).size;
    } catch (e) {
      stream.logSizeAtStart = 0;
    }
  }

  return stream.logSizeAtStart + stream.bytesWritten;
}

function archiveLog(stream) {
  if (stream.end) {
    stream.end();
  }

  try {
    fs.renameSync(stream.path, stream.path.replace(/log$/, 'old.log'));
  } catch (e) {
    logConsole('Could not rotate log', e);
  }
}

function logConsole(message, error) {
  var data = ['electron-log.transports.file: ' + message];

  if (error) {
    data.push(error);
  }

  consoleTransport({ data: data, date: new Date(), level: 'warn' });
}
