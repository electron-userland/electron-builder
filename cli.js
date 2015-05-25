#! /usr/bin/env node

/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var fs      = require( 'fs' );
var meow    = require( 'meow' );
var builder = ( require( './' ) ).init();
var usage   = fs.readFileSync( __dirname + '/usage.txt' ).toString();
var assign  = require( 'lodash.assign' );

var cli = meow( {
    help: usage
} );

var appPath = cli.input[ 0 ];
var name    = cli.input[ 1 ];

builder.build( assign( {
  appPath     : appPath,
  name        : name
}, cli.flags ), function( error ) {
  if ( error ) {
    console.error( error );

    return process.exit( 1 );
  }

  process.exit();
} );