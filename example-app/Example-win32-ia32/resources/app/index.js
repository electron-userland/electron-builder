'use strict';

require( 'crash-reporter' ).start();

const path             = require( 'path' );
const app              = require( 'app' );
const Menu             = require( 'menu' );
const Tray             = require( 'tray' );
const NativeImage      = require( 'native-image' );
const powerSaveBlocker = require( 'power-save-blocker' );

let appIcon        = null;
let currentBlocker = null;

/**
 * Icons to display inside of the tray
 *
 * @type {Object}
 */
let icons = {
  active    : NativeImage.createFromPath( path.join( __dirname, 'media', 'icon_active.png' ) ),
  notActive : NativeImage.createFromPath( path.join( __dirname, 'media', 'icon.png' ) )
}


/**
 * Menu to set inside of tray
 *
 * @type {Object}
 */
let menus = {
  active    : Menu.buildFromTemplate( [
    { label: 'Time for sleeping again', click : toggleSleepPermission },
    { label: 'Quit', click : app.quit }
  ] ),
  notActive : Menu.buildFromTemplate( [
    { label: 'Don\'t go to sleep', click : toggleSleepPermission },
    { label: 'Quit', click : app.quit }
  ] )
};


// kick off
app.on( 'ready', initTray );


/**
 * Initialize the tray
 */
function initTray() {
  if ( app.dock ) {
    app.dock.hide();
  }

  appIcon = new Tray( path.resolve( __dirname, 'media', 'icon.png' ) );
  appIcon.setToolTip( 'Block screensaver' );
  appIcon.setContextMenu( menus.notActive );
}


/**
 * Toggle sleep blocking functionality
 */
function toggleSleepPermission() {
  if ( currentBlocker === null ) {
    currentBlocker = powerSaveBlocker.start( 'prevent-display-sleep' );

    appIcon.setContextMenu( menus.active );
    appIcon.setImage( icons.active );
  } else {
    powerSaveBlocker.stop( currentBlocker );

    currentBlocker = null;

    appIcon.setContextMenu( menus.notActive );
    appIcon.setImage( icons.notActive );
  }
}
