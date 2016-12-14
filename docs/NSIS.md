# 32 bit + 64 bit

If you build both ia32 and x64 arch, you in any case get one installer. Appropriate arch will be installed automatically.

# Custom NSIS script

Two options are available — [include](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-include) and [script](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-script). `script` allows you to provide completely different NSIS script. For most cases it is not required as you need only to customise some aspects, but still use well-tested and maintained default NSIS script. So, `include` is recommended.

Keep in mind — if you customize NSIS script, you should always state about it in the issue reports. And don't expect that your issue will be resolved.

1. Add file `build/installer.nsh`.
2. Define wanted macro to customise: `customHeader`, `customInit`, `customUnInit`, `customInstall`, `customUnInstall`. Example:
   ```nsis
    !macro customHeader
      !system "echo '' > ${BUILD_RESOURCES_DIR}/customHeader"
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

# GUID vs Application Name

Windows requires to use registry keys (e.g. INSTALL/UNINSTALL info). Squirrel.Windows simply uses application name as key.
But it is not robust — Google can use key Google Chrome SxS, because it is a Google.

So, it is better to use [GUID](http://stackoverflow.com/a/246935/1910191).
You are not forced to explicitly specify it — name-based [UUID v5](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_5_.28SHA-1_hash_.26_namespace.29) will be generated from your [appId](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-appId) or [name](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-name).
It means that you **should not change appId** once your application in use (or name if `appId` was not set). Application product name (title) or description can be safely changed.

You can explicitly set guid using option [nsis.guid](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-guid), but it is not recommended — consider using [appId](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-appId).

It is also important to set the Application User Model ID (AUMID) to the [appId](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-appId) of the application, in order for notifications on Windows 8/8.1 to function and for Window 10 notifications to display the app icon within the notifications by default. The AUIMD should be set within the Main process and before any BrowserWindows have been opened, it is normally the first piece of code executed.

`app.setAppUserModelId(appId)`
