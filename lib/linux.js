/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var childProcess    = require( 'child_process' );
var os              = require( 'os' );
var writeConfigFile = require( './helper/writeConfigFile' );
var template        = require( 'lodash.template' );
var path            = require( 'path' );
var fs              = require( 'fs-extra' );

/**
 * Prototype for the linux installer builder
 * @type {Object}
 */
var LinuxBuilder = {
  /**
   * Build the installer for linux
   *
   * @param  {Object}   options  options
   * @param  {Function} callback callback
   */
  build : function( options, callback ) {
    options.log( '- Starting creation of installer for ´' + options.platform );

    var linux = options.config.linux;

    if ( linux.arch === 32 ) {
      linux.archName = 'i386';
    }
    else if ( linux.target === 'deb' ) {
      linux.archName = 'amd64';
    }
    else {
      linux.archName = 'x86_64';
    }

    var outFilename = linux.executable + '-' +
                      linux.version + '-' + linux.archName + '.' +
                      linux.target;
    var tmpFolder = path.join( os.tmpDir(), outFilename );
    _createFolders( tmpFolder );

    _createDesktopEntry( tmpFolder, linux );

    var scripts = _createScripts( linux );
    var destination = path.join( options.out, outFilename );
    _buildPackage( options, scripts, tmpFolder, destination, callback );
  }
};

/**
 * Create folders needed for the build
 *
 * @param {String} tmpFolder  folder where the packaged app is built
 */
function _createFolders( tmpFolder ) {
  fs.emptyDirSync( tmpFolder );
  fs.mkdirpSync( path.join( tmpFolder, 'usr', 'share', 'icons', 'hicolors' ) );
}

/**
 * Create desktop entry
 *
 * @param {String} tmpFolder  temp folder where the app is assembled
 * @param {Object} linux      linux conf
 */
function _createDesktopEntry( tmpFolder, linux ) {
  var desktopEntryTemplate = linux.desktopTemplate || path.join(
    __dirname,
    '..',
    'templates/linux/desktop.tpl'
  );
  var dest = path.join(
    tmpFolder,
    'usr', 'share', 'applications',
    linux.executable + '.desktop'
  );
  var tplFile = fs.readFileSync( desktopEntryTemplate, 'utf8' );
  var tpl = template( tplFile );
  var merge = tpl( linux );
  fs.outputFileSync( dest, merge );
}

/**
 * Create scripts
 *
 * @param {Object} linux  linux conf
 * @return an array containing the scripts paths
 */
function _createScripts ( linux ) {
  var afterInstallTemplate =  linux.afterInstall || path.join(
    __dirname,
    '..',
    'templates/linux/after-install.tpl'
  );
  var afterInstallFilePath = writeConfigFile( afterInstallTemplate, linux );

  var afterRemoveTemplate =  linux.afterRemove || path.join(
    __dirname,
    '..',
    'templates/linux/after-remove.tpl'
  );
  var afterRemoveFilePath = writeConfigFile( afterRemoveTemplate, linux );

  return [ afterInstallFilePath, afterRemoveFilePath ];
}

/**
 * Build the package
 *
 * @param {Object} options options
 * @param {Array}  scripts paths to scripts
 * @param {String} tmpFolder  temp folder where the app is assembled
 * @param {String} destination The package file path to output.
 * @param callback
 */
function _buildPackage( options, scripts, tmpFolder, destination, callback ) {
  var linux = options.config.linux;
  var installPath = 'opt/' + linux.executable;
  var args = [
    '-s', 'dir',
    '-t', linux.target,
    '--architecture', linux.archName,
    '--rpm-os', 'linux',
    '--name', linux.title,
    '--force',
    '--after-install', scripts[0],
    '--after-remove', scripts[1],
    '--description',  linux.comment,
    '--maintainer', linux.maintainer,
    '--version', linux.version,
    '--package', destination,
    '--deb-compression', linux.compression || 'xz',
    tmpFolder + '/=/',
    path.resolve( options.appPath ) + '/=/' + installPath
  ];

  fs.outputFileSync(
    path.join( tmpFolder, installPath, 'pkgtarget' ),
    linux.target
  );
  childProcess.execFile( 'fpm', args, function ( error, stdout, stderr ) {
    if ( error != null ) {
      console.error( stdout.toString() );
      console.error( stderr.toString() );
    }
    callback( error, destination );
  } );
}

/**
 * Expose factory function
 *
 * @type {Object}
 */
module.exports = {
  init : function() {
    return Object.create( LinuxBuilder );
  }
};
