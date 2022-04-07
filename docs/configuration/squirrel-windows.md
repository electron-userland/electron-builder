The top-level [squirrelWindows](configuration.md#Configuration-squirrelWindows) key contains set of options instructing electron-builder on how it should build Squirrel.Windows.

Squirrel.Windows target is maintained, but deprecated. Please use [nsis](nsis.md) instead.

To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
To build for Squirrel.Windows on macOS, please install `mono` (`brew install mono`).

Your app must be able to handle Squirrel.Windows startup events that occur during install and uninstall. See [electron-squirrel-startup](https://github.com/mongodb-js/electron-squirrel-startup).

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="SquirrelWindowsOptions-iconUrl">iconUrl</code> String | “undefined” - A URL to an ICO file to use as the application icon (displayed in Control Panel &gt; Programs and Features). Defaults to the Electron icon.</p>
<p>Please note — <a href="https://github.com/atom/grunt-electron-installer/issues/73">local icon file url is not accepted</a>, must be https/http.</p>
<p>If you don’t plan to build windows installer, you can omit it. If your project repository is public on GitHub, it will be <code>https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true</code> by default.</p>
</li>
<li>
<p><code id="SquirrelWindowsOptions-loadingGif">loadingGif</code> String | “undefined” - The path to a .gif file to display during install. <code>build/install-spinner.gif</code> will be used if exists (it is a recommended way to set) (otherwise <a href="https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif">default</a>).</p>
</li>
<li>
<p><code id="SquirrelWindowsOptions-msi">msi</code> Boolean - Whether to create an MSI installer. Defaults to <code>false</code> (MSI is not created).</p>
</li>
<li>
<p><code id="SquirrelWindowsOptions-remoteReleases">remoteReleases</code> String | Boolean | “undefined” - A URL to your existing updates. Or <code>true</code> to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.</p>
</li>
<li>
<p><code id="SquirrelWindowsOptions-remoteToken">remoteToken</code> String | “undefined” - Authentication token for remote updates</p>
</li>
<li>
<p><code id="SquirrelWindowsOptions-useAppIdAsId">useAppIdAsId</code> Boolean - Use <code>appId</code> to identify package instead of <code>name</code>.</p>
</li>
</ul>
<p>Inherited from <code>TargetSpecificOptions</code>:</p>
<ul>
<li><code id="SquirrelWindowsOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>.</li>
<li><code id="SquirrelWindowsOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</li>
</ul>

<!-- end of generated block -->
