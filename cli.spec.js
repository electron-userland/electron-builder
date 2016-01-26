'use strict';

/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var test         = require( 'tape' );
var tmp          = require( 'tmp' );
var fs           = require( 'fs' );
var childProcess = require( 'child_process' );
var rimraf       = require( 'rimraf' );

test( 'Cli - no input', function( t ) {
  t.plan( 1 );
  childProcess.execFile(
    '../cli.js' ,
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.ok( error, 'Error thrown' );
      t.end();
    }
  );
} );

test( 'Cli - config file provided but not found', function( t ) {
  t.plan( 1 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example.app', '--platform=osx', '--config=no-builder.json' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.ok( error, 'Error thrown' );
      t.end();
    }
  );
} );

test( 'Cli - osx - config file provided', function( t ) {
  t.plan( 2 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example.app', '--platform=osx', '--config=builder.json' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.notOk( error, 'No error thrown' );
      t.ok(
        fs.statSync( __dirname + '/example-app/Builder\ Config\ osx\ Example.dmg' ),
        'dmg created'
      );

      rimraf.sync( __dirname + '/example-app/Builder\ Config\ osx\ Example.dmg' );

      t.end();
    }
  );
} );

test( 'Cli - windows - config file provided', function( t ) {
  t.plan( 2 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example-win32-ia32', '--platform=win', '--config=builder.json' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.notOk( error, 'No error thrown' );
      t.ok(
        fs.statSync( __dirname + '/example-app/Builder\ Config\ Windows\ example\ Setup.exe' ),
        'exe created'
      );

      rimraf.sync( __dirname + '/example-app/Builder\ Config\ Windows\ example\ Setup.exe' );

      t.end();
    }
  );
} );

test( 'Cli - linux - config file provided', function( t ) {
  t.plan( 2 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example-win32-ia32', '--platform=linux', '--config=builder.json' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.notOk( error, 'No error thrown' );
      t.ok(
        fs.statSync( __dirname + '/example-app/myExec-1.0-amd64.deb' ),
        'deb created'
      );

      rimraf.sync( __dirname + '/example-app/myExec-1.0-amd64.deb' );

      t.end();
    }
  );
} );

test( 'Cli - osx - no config file provided', function( t ) {
  t.plan( 2 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example.app', '--platform=osx' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.notOk( error, 'No error thrown' );
      t.ok(
        fs.statSync( __dirname + '/example-app/Electron\ Builder\ Example.dmg' ),
        'dmg created'
      );

      rimraf.sync( __dirname + '/example-app/Electron\ Builder\ Example.dmg' );

      t.end();
    }
  );
} );

test( 'Cli - windows - no config file provided', function( t ) {
  t.plan( 2 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example-win32-ia32', '--platform=win' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.notOk( error, 'No error thrown' );
      t.ok(
        fs.statSync( __dirname + '/example-app/Electron\ Builder\ Example\ Setup.exe' ),
        'exe created'
      );

      rimraf.sync( __dirname + '/example-app/Electron\ Builder\ Example\ Setup.exe' );

      t.end();
    }
  );
} );

test( 'Cli - linux - no config file provided', function( t ) {
  t.plan( 2 );

  childProcess.execFile(
    '../cli.js' ,
    [ 'Example-win32-ia32', '--platform=linux' ],
    { cwd : __dirname + '/example-app' },
    function( error, stdout, stderr ) {
      t.notOk( error, 'No error thrown' );
      t.ok(
        fs.statSync( __dirname + '/example-app/myExec-1.0-amd64.deb' ),
        'deb created'
      );

      rimraf.sync( __dirname + '/example-app/myExec-1.0-amd64.deb' );

      t.end();
    }
  );
} );
