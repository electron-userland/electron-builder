* <code id="MsiOptions-oneClick">oneClick</code> = `true` Boolean - One-click installation.
* <code id="MsiOptions-upgradeCode">upgradeCode</code> String | "undefined" - The [upgrade code](https://msdn.microsoft.com/en-us/library/windows/desktop/aa372375(v=vs.85).aspx). Optional, by default generated using app id.
* <code id="MsiOptions-warningsAsErrors">warningsAsErrors</code> = `true` Boolean - If `warningsAsErrors` is `true` (default): treat warnings as errors. If `warningsAsErrors` is `false`: allow warnings.
* <code id="MsiOptions-additionalWixArgs">additionalWixArgs</code> Array&lt;String&gt; | "undefined" - Any additional arguments to be passed to the WiX installer compiler, such as `["-ext", "WixUtilExtension"]`
* <code id="MsiOptions-perMachine">perMachine</code> = `false` Boolean - Whether to install per all users (per-machine).
* <code id="MsiOptions-runAfterFinish">runAfterFinish</code> = `true` Boolean - Whether to run the installed application after finish. For assisted installer corresponding checkbox will be removed.

---

* <code id="MsiOptions-createDesktopShortcut">createDesktopShortcut</code> = `true` Boolean | "always" - Whether to create desktop shortcut. Set to `always` if to recreate also on reinstall (even if removed by user).
* <code id="MsiOptions-createStartMenuShortcut">createStartMenuShortcut</code> = `true` Boolean - Whether to create start menu shortcut.
* <code id="MsiOptions-menuCategory">menuCategory</code> = `false` Boolean | String - Whether to create submenu for start menu shortcut and program files directory. If `true`, company name will be used. Or string value.
* <code id="MsiOptions-shortcutName">shortcutName</code> String | "undefined" - The name that will be used for all shortcuts. Defaults to the application name.
