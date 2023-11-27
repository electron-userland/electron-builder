<ul>
<li><code id="MsiWrappedOptions-wrappedInstallerArgs">wrappedInstallerArgs</code> String | “undefined” - Extra arguments to provide to the wrapped installer (ie: /S for silent install)</li>
<li><code id="MsiWrappedOptions-impersonate">impersonate</code> = <code>false</code> Boolean - Determines if the wrapped installer should be executed with impersonation</li>
<li><code id="MsiWrappedOptions-upgradeCode">upgradeCode</code> String | “undefined” - The <a href="https://msdn.microsoft.com/en-us/library/windows/desktop/aa372375(v=vs.85).aspx">upgrade code</a>. Optional, by default generated using app id.</li>
<li><code id="MsiWrappedOptions-warningsAsErrors">warningsAsErrors</code> = <code>true</code> Boolean - If <code>warningsAsErrors</code> is <code>true</code> (default): treat warnings as errors. If <code>warningsAsErrors</code> is <code>false</code>: allow warnings.</li>
<li><code id="MsiWrappedOptions-additionalWixArgs">additionalWixArgs</code> Array&lt;String&gt; | “undefined” - Any additional arguments to be passed to the WiX installer compiler, such as <code>[&quot;-ext&quot;, &quot;WixUtilExtension&quot;]</code></li>
<li><code id="MsiWrappedOptions-oneClick">oneClick</code> Boolean</li>
<li><code id="MsiWrappedOptions-perMachine">perMachine</code> = <code>false</code> Boolean - Whether to install per all users (per-machine).</li>
<li><code id="MsiWrappedOptions-runAfterFinish">runAfterFinish</code> = <code>true</code> Boolean - Whether to run the installed application after finish. For assisted installer corresponding checkbox will be removed.</li>
</ul>
<hr>
<ul>
<li><code id="MsiWrappedOptions-createDesktopShortcut">createDesktopShortcut</code> = <code>true</code> Boolean | “always” - Whether to create desktop shortcut. Set to <code>always</code> if to recreate also on reinstall (even if removed by user).</li>
<li><code id="MsiWrappedOptions-createStartMenuShortcut">createStartMenuShortcut</code> = <code>true</code> Boolean - Whether to create start menu shortcut.</li>
<li><code id="MsiWrappedOptions-menuCategory">menuCategory</code> = <code>false</code> Boolean | String - Whether to create submenu for start menu shortcut and program files directory. If <code>true</code>, company name will be used. Or string value.</li>
<li><code id="MsiWrappedOptions-shortcutName">shortcutName</code> String | “undefined” - The name that will be used for all shortcuts. Defaults to the application name.</li>
</ul>
