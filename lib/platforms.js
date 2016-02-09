/*
 * electron-builder
 * https://github.com/loopline-systems/electron-builder
 *
 * Licensed under the MIT license.
 */

var mapping = {
  osx   : './osx',
  win   : './win',
  win32 : './win',
  linux : './linux'
};

module.exports = function( platform ) {
  if ( ! mapping[ platform ] ) {
    throw new Error(
      'Building for ´' + platform + '´ is not supported'
    );
  }

  return require( mapping[ platform ] );
};
