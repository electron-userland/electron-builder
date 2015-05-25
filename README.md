# electron-builder (WIP)

## Building MacOS installer

```
$ electron-builder fancyApp.app "Fancy App" --platform=macos --out=/some/path/to/output/dir/ --macos-icon=/path/to/icon/mount.icns --macos-background=/path/to/moung/background.png
```

## Build Windows installer

```
$ electron-builder fandyApp-win32 "Fancy App" --platform=win --out=/some/path/to/output/dir/
```

## Node module

```
var builder = ( require( 'electron-builder' ) ).init();

builder.build( options, function( error ) {
  if ( error ) {
    console.error( error );

    return process.exit( 1 );
  }

  console.log( '- Created installer for ' + options.platform + ' -' );

  process.exit();
} );
```