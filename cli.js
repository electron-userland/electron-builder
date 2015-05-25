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
var path    = require( 'path' );

var cli = meow( {
    help: usage
} );

var appPath = path.join( process.cwd(), cli.input[ 0 ] );

builder.build( assign( {
  appPath     : appPath
}, cli.flags ), function( error ) {
  if ( error ) {
    console.error( error );

    return process.exit( 1 );
  }

  console.log( '- Created installer for ' + cli.flags.platform + ' -' );

  process.exit();
} );