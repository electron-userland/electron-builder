# electron-updater

This module allows to automatically update your application. You only need to install this module and write two lines of code!
To publish your updates you just need a simple file hosting, it does not require a dedicated server.

See the [Auto Update](https://github.com/electron-userland/electron-builder/wiki/Auto-Update) section 
of the [Wiki](https://github.com/electron-userland/electron-builder/wiki) for more information.

Supported OS: 
 - macOS ([Squirrel.Mac](https://github.com/Squirrel/Squirrel.Mac)).
 - Windows (NSIS).
 
Linux support is [planned](https://github.com/electron-userland/electron-builder/issues/1138).
 
## Differences between electron-updater and built-in autoUpdater

* Actually, autoUpdater is used inside (on macOS).
* It doesn't require a dedicated release server.
* You need only 2 lines of code to make it work.
* [electron-builder](https://github.com/electron-userland/electron-builder) produces and published all required metadata files and artifacts.

## Credits

Thanks to [Evolve Labs](https://www.evolvehq.com) for donating the npm package name.