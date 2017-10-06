The top-level [nsis](/configuration/configuration.md#Configuration-nsis) key contains set of options instructing electron-builder on how it should build NSIS target (default target for Windows).

These options also applicable for [Web installer](#web-installer), use top-level `nsisWeb` key.

<!-- do not edit. start of generated block -->
* <code id="NsisOptions-oneClick">oneClick</code> = `true` Boolean - One-click installation.
* <code id="NsisOptions-perMachine">perMachine</code> = `false` Boolean - If `oneClick` is `true` (default): Install per all users (per-machine).
  
  If `oneClick` is `false`: no install mode installer page (choice per-machine or per-user), always install per-machine.
* <code id="NsisOptions-allowElevation">allowElevation</code> = `true` Boolean - *assisted installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions.
* <code id="NsisOptions-allowToChangeInstallationDirectory">allowToChangeInstallationDirectory</code> = `false` Boolean - *assisted installer only.* Whether to allow user to change installation directory.
* <code id="NsisOptions-runAfterFinish">runAfterFinish</code> = `true` Boolean - *one-click installer only.* Run application after finish.

---

* <code id="NsisOptions-installerIcon">installerIcon</code> String - The path to installer icon, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerIcon.ico` or application icon.
* <code id="NsisOptions-uninstallerIcon">uninstallerIcon</code> String - The path to uninstaller icon, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/uninstallerIcon.ico` or application icon.
* <code id="NsisOptions-installerHeader">installerHeader</code> = `build/installerHeader.bmp` String - *assisted installer only.* `MUI_HEADERIMAGE`, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory.
* <code id="NsisOptions-installerHeaderIcon">installerHeaderIcon</code> String - *one-click installer only.* The path to header icon (above the progress bar), relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerHeaderIcon.ico` or application icon.
* <code id="NsisOptions-installerSidebar">installerSidebar</code> String - *assisted installer only.* `MUI_WELCOMEFINISHPAGE_BITMAP`, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory. Defaults to `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`. Image size 164 × 314 pixels.
* <code id="NsisOptions-uninstallerSidebar">uninstallerSidebar</code> String - *assisted installer only.* `MUI_UNWELCOMEFINISHPAGE_BITMAP`, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory. Defaults to `installerSidebar` option or `build/uninstallerSidebar.bmp` or `build/installerSidebar.bmp` or `${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp`
* <code id="NsisOptions-uninstallDisplayName">uninstallDisplayName</code> = `${productName} ${version}` String - The uninstaller display name in the control panel.

---

* <code id="NsisOptions-include">include</code> String - The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](#custom-nsis-script).
* <code id="NsisOptions-script">script</code> String - The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](#custom-nsis-script).
* <code id="NsisOptions-license">license</code> String - The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). In addition to `txt, `rtf` and `html` supported (don't forget to use `target="_blank"` for links).
  
  Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources. If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).
  
  Appropriate license file will be selected by user OS language.
* <code id="NsisOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template). Defaults to `${productName} Setup ${version}.${ext}`.
* <code id="NsisOptions-deleteAppDataOnUninstall">deleteAppDataOnUninstall</code> = `false` Boolean - *one-click installer only.* Whether to delete app data on uninstall.
* <code id="NsisOptions-differentialPackage">differentialPackage</code> Boolean - Defaults to `true` for web installer (`nsis-web`)

---

* <code id="NsisOptions-createDesktopShortcut">createDesktopShortcut</code> = `true` Boolean - Whether to create desktop shortcut.
* <code id="NsisOptions-menuCategory">menuCategory</code> = `false` Boolean | String - Whether to create submenu for start menu shortcut and program files directory. If `true`, company name will be used. Or string value.
* <code id="NsisOptions-shortcutName">shortcutName</code> String - The name that will be used for all shortcuts. Defaults to the application name.

---

* <code id="NsisOptions-displayLanguageSelector">displayLanguageSelector</code> = `false` Boolean - Whether to display a language selection dialog. Not recommended (by default will be detected using OS language).
* <code id="NsisOptions-installerLanguages">installerLanguages</code> Array&lt;String&gt; | String - The installer languages (e.g. `en_US`, `de_DE`). Change only if you understand what do you do and for what.
* <code id="NsisOptions-language">language</code> String - [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
* <code id="NsisOptions-multiLanguageInstaller">multiLanguageInstaller</code> Boolean - Whether to create multi-language installer. Defaults to `unicode` option value.
* <code id="NsisOptions-packElevateHelper">packElevateHelper</code> = `true` Boolean - Whether to pack the elevate executable (required for electron-updater if per-machine installer used or can be used in the future). Ignored if `perMachine` is set to `true`.
* <code id="NsisOptions-unicode">unicode</code> = `true` Boolean - Whether to create [Unicode installer](http://nsis.sourceforge.net/Docs/Chapter1.html#intro-unicode).
* <code id="NsisOptions-guid">guid</code> String - See [GUID vs Application Name](../configuration/nsis.md#guid-vs-application-name).
* <code id="NsisOptions-warningsAsErrors">warningsAsErrors</code> = `true` Boolean - If `warningsAsErrors` is `true` (default): NSIS will treat warnings as errors. If `warningsAsErrors` is `false`: NSIS will allow warnings.

Inherited from `TargetSpecificOptions`:
* <code id="NsisOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
<!-- end of generated block -->

---

Unicode enabled by default. Large strings are supported (maximum string length of 8192 bytes instead of the default of 1024 bytes).

## 32 bit + 64 bit

If you build both ia32 and x64 arch (`--x64 --ia32`), you in any case get one installer. Appropriate arch will be installed automatically.
The same applied to web installer (`nsis-web` [target](/configuration/win.md#WindowsConfiguration-target)).

## Web Installer

To build web installer, set [target](/configuration/win.md#WindowsConfiguration-target) to `nsis-web`. Web Installer automatically detects OS architecture and downloads corresponding package file. So, user don't need to guess what installer to download and in the same time you don't bundle package files for all architectures in the one installer (as in case of default `nsis` target). It doesn't matter for common Electron application (due to superb LZMA compression, size difference is acceptable), but if your application is huge, Web Installer is a solution.

To customize web installer, use the top-level `nsisWeb` key (not `nsis`).

If for some reasons web installer cannot download (antivirus, offline):
* Download package file into the same directory where installer located. It will be detected automatically and used instead of downloading from the Internet. Please note — only original package file is allowed (checksum is checked).
* Specify any local package file using `--package-file=path_to_file`.



## Custom NSIS script

Two options are available — [include](#NsisOptions-include) and [script](#NsisOptions-script). `script` allows you to provide completely different NSIS script. For most cases it is not required as you need only to customise some aspects, but still use well-tested and maintained default NSIS script. So, `include` is recommended.

Keep in mind — if you customize NSIS script, you should always state about it in the issue reports. And don't expect that your issue will be resolved.

1. Add file `build/installer.nsh`.
2. Define wanted macro to customise: `customHeader`, `preInit`, `customInit`, `customUnInit`, `customInstall`, `customUnInstall`, `customRemoveFiles`. Example:
   ```nsis
    !macro customHeader
      !system "echo '' > ${BUILD_RESOURCES_DIR}/customHeader"
    !macroend

    !macro preInit
      ; This macro is inserted at the beginning of the NSIS .OnInit callback
      !system "echo '' > ${BUILD_RESOURCES_DIR}/preInit"
    !macroend
  
    !macro customInit
      !system "echo '' > ${BUILD_RESOURCES_DIR}/customInit"
    !macroend
  
    !macro customInstall
      !system "echo '' > ${BUILD_RESOURCES_DIR}/customInstall"
    !macroend
   ```

* `BUILD_RESOURCES_DIR` and `PROJECT_DIR` are defined.
* `build` is added as `addincludedir` (i.e. you don't need to use `BUILD_RESOURCES_DIR` to include files).
* File associations macro `registerFileAssociations` and `unregisterFileAssociations` are still defined.
* All other electron-builder specific flags (e.g. `ONE_CLICK`) are still defined.

## GUID vs Application Name

Windows requires to use registry keys (e.g. INSTALL/UNINSTALL info). Squirrel.Windows simply uses application name as key.
But it is not robust — Google can use key Google Chrome SxS, because it is a Google.

So, it is better to use [GUID](http://stackoverflow.com/a/246935/1910191).
You are not forced to explicitly specify it — name-based [UUID v5](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_5_.28SHA-1_hash_.26_namespace.29) will be generated from your [appId](configuration.md#Configuration-appId) or [name](configuration.md#Metadata-name).
It means that you **should not change appId** once your application in use (or name if `appId` was not set). Application product name (title) or description can be safely changed.

You can explicitly set guid using option [nsis.guid](#NsisOptions-guid), but it is not recommended — consider using [appId](configuration.md#Configuration-appId).

It is also important to set the Application User Model ID (AUMID) to the [appId](configuration.md#Configuration-appId) of the application, in order for notifications on Windows 8/8.1 to function and for Window 10 notifications to display the app icon within the notifications by default. The AUMID should be set within the Main process and before any BrowserWindows have been opened, it is normally the first piece of code executed: `app.setAppUserModelId(appId)`

---

## Common Questions
#### How do change the default installation directory to custom?

It is very specific requirement. Do not do if you are not sure. Add [custom macro](#custom-nsis-script):

```nsis
macro preInit
	SetRegView 64
	WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
	WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
	SetRegView 32
	WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
	WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
!macroend
```


