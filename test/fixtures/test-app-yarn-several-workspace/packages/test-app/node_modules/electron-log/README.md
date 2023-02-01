# electron-log
[![Build Status](https://travis-ci.org/megahertz/electron-log.svg?branch=master)](https://travis-ci.org/megahertz/electron-log)
[![NPM version](https://badge.fury.io/js/electron-log.svg)](https://badge.fury.io/js/electron-log)
[![Dependencies status](https://david-dm.org/megahertz/electron-log/status.svg)](https://david-dm.org/megahertz/electron-log)

## Description

Just a simple logging module for your Electron or NW.js application.
No dependencies. No complicated configuration. Just require and use.
It can be used without Electron.

By default it writes logs to the following locations:

 * **on Linux:** `~/.config/<app name>/log.log`
 * **on OS X:** `~/Library/Logs/<app name>/log.log`
 * **on Windows:** `%USERPROFILE%\AppData\Roaming\<app name>\log.log`

## Installation

Install with [npm](https://npmjs.org/package/electron-log):

    npm install electron-log

## Usage

```js
var log = require('electron-log');

log.info('Hello, log');
```
### Log levels

electron-log supports the following log levels:

    error, warn, info, verbose, debug, silly

### Transport

Transport is a simple function which requires an object which describes
a message. By default, two transports are active: console and file.
Please be aware that the file log level is 'warn' by default, so info
and debug messages will be filtered. The file path is dependent on the
current platform.



#### Disable default transport:

```js
log.transports.file.level = false;
log.transports.console.level = false;
```
    
#### Override transport:

```js
var format = require('util');

log.transports.console = function(msg) {
  var text = util.format.apply(util, msg.data);
  console.log(`[${msg.date.toLocaleTimeString()} ${msg.level}] ${text}`);
};
```
Please be aware that if you override a transport function the default
transport options (like level or format) will be undefined.
    
#### Console Transport

```js
// Log level
log.transports.console.level = 'warn';

/** 
 * Set output format template. Available variables:
 * Main: {level}, {text}
 * Date: {y},{m},{d},{h},{i},{s},{ms}
 */
log.transports.console.format = '{h}:{i}:{s}:{ms} {text}';

// Set a function which formats output
log.transports.console.format = (msg) => util.format.apply(util, msg.data);
```

#### Renderer Console transport
Show logs in Chromium DevTools Console. It has the same options as
console transport.

#### File transport

```js
// Same as for console transport
log.transports.file.level = 'warn';
log.transports.file.format = '{h}:{i}:{s}:{ms} {text}';

// Set approximate maximum log size in bytes. When it exceeds,
// the archived log will be saved as the log.old.log file
log.transports.file.maxSize = 5 * 1024 * 1024;

// Write to this file, must be set before first logging
log.transports.file.file = __dirname + '/log.txt';

// fs.createWriteStream options, must be set before first logging
log.transports.file.streamConfig = { flags: 'w' };

// set existed file stream
log.transports.file.stream = fs.createWriteStream('log.txt');
```

By default, file transport reads a productName or name property from
package.json to determine a log path like
`~/.config/<app name>/log.log`. If you have no package.json or you want
to specify another path, just set the appName property:

```js
log.transports.file.appName = 'test';
```
This value should be set before the first log method call.

## Renderer process

Since version 2.0.0 this package works differently in main and renderer
processes. When it's included in a renderer process it sends logs to
the main process through IPC. There are no API changes, you can still
require the package by the same way both in main and renderer processes,
but please be aware that transport configuration is available only
inside the main process.

## Change Log

**2.1.0**
 - Add Renderer Console transport

**2.0.0**
 - Move log.appName property to log.transports.file.appName.
 - Change a log message object. See updated
 [Override transport section](#override-transport) if you use a custom
 transport.
 - Now it's not possible to configure transports from a renderer
 process, only from the main.
 - To disable a transport set its level to false.
 - Fix problems when this package is used from a renderer process.
 - Add Typescript definitions.
 - Add [log-s](https://github.com/megahertz/log-s) transport
 (experimental).
 - Fix file transport appName detection when an application is run
 in dev environment (through `electron .` or similar way)

**1.3.0**

- #18 Rename 'warning' log level to 'warn'

**1.2.0**

 - #14 Use native console levels instead of console.log
 
**1.0.16**

 - Prefer to use package.json:productName instead of package.json:name
 to determine a log path.

## License

Licensed under MIT.
