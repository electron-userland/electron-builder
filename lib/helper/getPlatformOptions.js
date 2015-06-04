/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

'use strict';

var camelCase = require( 'lodash.camelcase' );


/**
 * Extract platform specific options
 * and remove platform in propert name
 *
 * @param  {Object} options  options
 * @param  {String} platform platform string the option to start with
 *
 * @return {Object}          platform specific options
 */
module.exports = function( options, platform ) {
  var keys = Object.keys( options );
  var newOptions = {};

  keys.forEach( function( key ) {
    if ( key.indexOf( platform ) === 0 ) {
      newOptions[ camelCase( key ) ] = options[ key ];
    }
  } );

  return newOptions;
};
