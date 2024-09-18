The top-level [squirrelWindows](configuration.md#squirrelWindows) key contains set of options instructing electron-builder on how it should build Squirrel.Windows.

Squirrel.Windows target is maintained, but deprecated. Please use [nsis](nsis.md) instead.

To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
To build for Squirrel.Windows on macOS, please install `mono` (`brew install mono`).

Your app must be able to handle Squirrel.Windows startup events that occur during install and uninstall. See [electron-squirrel-startup](https://github.com/mongodb-js/electron-squirrel-startup).

## Configuration

{!./app-builder-lib.Interface.SquirrelWindowsOptions.md!}