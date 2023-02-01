// jshint -W074, -W089
'use strict';

var http  = require('http');
var https = require('https');
var url   = require('url');

transport.client = { name: 'electron-application' };
transport.depth  = 6;
transport.level  = false;
transport.url    = null;

module.exports = transport;

function transport(msg) {
  if (!transport.url) return;

  var data = jsonDepth({
    client: transport.client,
    data: msg.data,
    date: msg.date.getTime(),
    level: msg.level
  }, transport.depth + 1);

  post(transport.url, data);
}

function post(serverUrl, data) {
  var urlObject = url.parse(serverUrl);
  var transport = urlObject.protocol === 'https:' ? https : http;

  var body = JSON.stringify(data);

  var options = {
    hostname: urlObject.hostname,
    port:     urlObject.port,
    path:     urlObject.path,
    method:   'POST',
    headers:  {
      'Content-Type':  'application/json',
      'Content-Length': body.length
    }
  };

  var request = transport.request(options);
  request.write(body);
  request.end();
}

function jsonDepth(json, depth) {
  if (depth < 1) {
    if (Array.isArray(json))  return '[array]';
    if (typeof json === 'object')  return '[object]';
    return json;
  }

  if (Array.isArray(json)) {
    return json.map(function(child) {
      return jsonDepth(child, depth - 1);
    });
  }

  if (json && typeof json.getMonth === 'function') {
    return json;
  }

  if (json === null) {
    return null;
  }

  if (typeof json === 'object') {
    if (typeof json.toJSON === 'function') {
      json = json.toJSON();
    }

    var newJson = {};
    for (var i in json) {
      //noinspection JSUnfilteredForInLoop
      newJson[i] = jsonDepth(json[i], depth - 1);
    }

    return newJson;
  }

  return json;
}