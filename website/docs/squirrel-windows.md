---
title: "Squirrel.Windows"
---

The top-level [squirrelWindows](./configuration.md#squirrelwindows) key contains a set of options instructing electron-builder on how it should build Squirrel.Windows.

Squirrel.Windows target is maintained, but deprecated. Please use [nsis](nsis.md) instead.

To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
To build for Squirrel.Windows on macOS or Linux, please install `mono` (`brew install mono` / `apt install mono-devel`).

The Squirrel vendor binaries (`Squirrel.exe`, `SyncReleases.exe`, `nuget.exe`, …) are downloaded from the checksummed `squirrel.windows` bundle; `rcedit` comes from the `winCodeSign` bundle. Pin a version or supply your own bundle via [`toolsets.squirrel`](./toolsets.md).

Your app must be able to handle Squirrel.Windows startup events that occur during install and uninstall. See [electron-squirrel-startup](https://github.com/mongodb-js/electron-squirrel-startup).

## Configuration

  {!./app-builder-lib.Interface.SquirrelWindowsOptions.md!}