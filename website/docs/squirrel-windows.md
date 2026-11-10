---
title: "Squirrel.Windows"
---

The top-level [squirrelWindows](./configuration.md#squirrelwindows) key contains a set of options instructing electron-builder on how it should build Squirrel.Windows.

Squirrel.Windows target is maintained, but deprecated. Please use [nsis](nsis.md) instead.

To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
To build for Squirrel.Windows on macOS or Linux, please install `mono` (`brew install mono` / `apt install mono-devel`). Mono is started by absolute path, from its default install locations or [`toolsets.executables.mono`](./toolsets.md#executables), never from `PATH`.

The Squirrel vendor binaries (`Squirrel.exe`, `SyncReleases.exe`, `nuget.exe`, …) are downloaded from the checksummed `squirrel.windows` bundle; `rcedit` comes from the `winCodeSign` bundle. Pin a version or supply your own bundle via [`toolsets.squirrel`](./toolsets.md).

Your app must be able to handle Squirrel.Windows startup events that occur during install and uninstall. See [electron-squirrel-startup](https://github.com/mongodb-js/electron-squirrel-startup).

`msi: true` makes Squirrel.Windows build an MSI as well. Squirrel.Windows builds it around `Setup.exe` before electron-builder signs `Setup.exe`, so the installer inside that MSI is unsigned: the build warns, and fails with [`forceCodeSigning`](./features/code-signing/code-signing.md#the-forcecodesigning-option). For a signed MSI, use the [`msi`](./msi.md) target instead.

## Configuration

  {!./app-builder-lib.Interface.SquirrelWindowsOptions.md!}