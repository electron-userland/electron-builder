The top-level [squirrelWindows](configuration.md#Configuration-squirrelWindows) key contains set of options instructing electron-builder on how it should build Squirrel.Windows.

Squirrel.Windows target is maintained, but deprecated. Please use [nsis](nsis.md) instead.

To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
To build for Squirrel.Windows on macOS, please install `mono` (`brew install mono`).

<!-- do not edit. start of generated block -->
* <code id="SquirrelWindowsOptions-iconUrl">iconUrl</code> String - A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.
  
  Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.
  
  If you don't plan to build windows installer, you can omit it. If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
* <code id="SquirrelWindowsOptions-loadingGif">loadingGif</code> String - The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set) (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
* <code id="SquirrelWindowsOptions-msi">msi</code> Boolean - Whether to create an MSI installer. Defaults to `false` (MSI is not created).
* <code id="SquirrelWindowsOptions-remoteReleases">remoteReleases</code> String | Boolean - A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
* <code id="SquirrelWindowsOptions-remoteToken">remoteToken</code> String - Authentication token for remote updates
* <code id="SquirrelWindowsOptions-useAppIdAsId">useAppIdAsId</code> Boolean - Use `appId` to identify package instead of `name`.

Inherited from `TargetSpecificOptions`:
* <code id="SquirrelWindowsOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="SquirrelWindowsOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
<!-- end of generated block -->