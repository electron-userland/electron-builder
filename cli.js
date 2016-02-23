#! /usr/bin/env node

/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var fs      = require( 'fs' );
var meow    = require( 'meow' );
var path    = require( 'path' );

var builder = ( require( './' ) ).init();
var usage   = fs.readFileSync(
  path.join( __dirname, 'docs', 'deprecated-usage.txt' ),  'utf8' );

var cli = meow( usage, {
  help  : usage,
  alias : {
    h : 'help'
  }
} );

if ( cli.input[ 0 ] == null ) {

  console.error( usage );
  throw new Error( 'Path to electron app not provided' );

}

// resolve app path
var appPath = path.resolve( process.cwd(), cli.input[ 0 ] );

// read config from file or package.json
var config;
var configPath;
var configProperty;

if ( typeof cli.flags.config === 'string' ) {
  configPath = path.resolve( process.cwd(), cli.flags.config );
} else {
  configPath     = process.cwd() + '/package.json';
  configProperty = 'builder';
}

try {
  config = getConfigFromFile( configPath, configProperty );
} catch( error ) {
  throw new Error( 'Could not load config file:\n' + error.message );
}

var basePath = path.dirname( configPath );

builder.build( Object.assign( cli.flags, {
  appPath  : appPath,
  config   : config,
  basePath : basePath
} ), function( error ) {
  if ( error ) {
    throw error;
  }

  console.log( '- Created installer for ' + cli.flags.platform + ' -' );
} );


////////////////////////////////////////////////////////////////////////////////


/**
 * Read config file and return config
 *
 * @param  {String}           configPath config file path
 * @param  {String|undefined} property   property to include config
 *
 * @return {Object}                      configuration
 */
function getConfigFromFile( configPath, property ) {
  var config = require( configPath );

  if ( property ) {
    if ( config[ property ] ) {
      config = config[ property ];
    } else {
      throw new Error( '\'' + property + '\' is not defined in ' + configPath );
    }
  }

  return config;
}
