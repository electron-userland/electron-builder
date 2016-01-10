/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var test             = require( 'tape' );
var fs               = require( 'fs' );
var tmp              = require( 'tmp' );
var writeConfigFile  = require( './writeConfigFile' );

var tmpObj       = tmp.dirSync();
var templatePath = tmpObj.name + '/template.tpl';

fs.writeFileSync( templatePath, 'Foo <%= bar %> baz' );

test( 'helper - writeConfigFile', function( t ) {
  var configPath = writeConfigFile( templatePath, { bar : 'bar' } );

  var config = fs.readFileSync( configPath, 'utf8' );

  t.equal( config, 'Foo bar baz' );
  t.end();

  fs.unlink( templatePath );
} );
