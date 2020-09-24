The top-level [nsis](configuration.md#Configuration-nsis) key contains set of options instructing electron-builder on how it should build NSIS target (default target for Windows).

These options also applicable for [Web installer](#web-installer), use top-level `nsisWeb` key.

{!generated/NsisOptions.md!}

---

Inherited from `TargetSpecificOptions`:

{!generated/TargetSpecificOptions.md!}

---

Unicode enabled by default. Large strings are supported (maximum string length of 8192 bytes instead of the default of 1024 bytes).

## 32 bit + 64 bit

If you build both ia32 and x64 arch (`--x64 --ia32`), you in any case get one installer. Appropriate arch will be installed automatically.
The same applied to web installer (`nsis-web` [target](win.md#WindowsConfiguration-target)).

## Web Installer

To build web installer, set [target](win.md#WindowsConfiguration-target) to `nsis-web`. Web Installer automatically detects OS architecture and downloads corresponding package file. So, user don't need to guess what installer to download and in the same time you don't bundle package files for all architectures in the one installer (as in case of default `nsis` target). It doesn't matter for common Electron application (due to superb LZMA compression, size difference is acceptable), but if your application is huge, Web Installer is a solution.

To customize web installer, use the top-level `nsisWeb` key (not `nsis`).

If for some reasons web installer cannot download (antivirus, offline):

* Download package file into the same directory where installer located. It will be detected automatically and used instead of downloading from the Internet. Please note — only original package file is allowed (checksum is checked).
* Specify any local package file using `--package-file=path_to_file`.

## Custom NSIS script

Two options are available — [include](#NsisOptions-include) and [script](#NsisOptions-script). `script` allows you to provide completely different NSIS script. For most cases it is not required as you need only to customise some aspects, but still use well-tested and maintained default NSIS script. So, `include` is recommended.

Keep in mind — if you customize NSIS script, you should always state about it in the issue reports. And don't expect that your issue will be resolved.

1. Add file `build/installer.nsh`.
2. Define wanted macro to customise: `customHeader`, `preInit`, `customInit`, `customUnInit`, `customInstall`, `customUnInstall`, `customRemoveFiles`, `customInstallMode`.
    
    !!! example
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
        
        !macro customInstallMode
          # set $isForceMachineInstall or $isForceCurrentInstall 
          # to enforce one or the other modes.
        !macroend
        ```

* `BUILD_RESOURCES_DIR` and `PROJECT_DIR` are defined.
* `build` is added as `addincludedir` (i.e. you don't need to use `BUILD_RESOURCES_DIR` to include files).
* `build/x86-unicode` and `build/x86-ansi` are added as `addplugindir`.
* File associations macro `registerFileAssociations` and `unregisterFileAssociations` are still defined.
* All other electron-builder specific flags (e.g. `ONE_CLICK`) are still defined.

If you want to include additional resources for use during installation, such as scripts or additional installers, you can place them in the `build` directory and include them with `File`. For example, to include and run `extramsi.msi` during installation, place it in the `build` directory and use the following:

```nsis
!macro customInstall
  File /oname=$PLUGINSDIR\extramsi.msi "${BUILD_RESOURCES_DIR}\extramsi.msi"
  ExecWait '"msiexec" /i "$PLUGINSDIR\extramsi.msi" /passive'
!macroend
```

??? question "Is there a way to call just when the app is installed (or uninstalled) manually and not on update?"
    Use `${isUpdated}`.
    
    ```nsis
    ${ifNot} ${isUpdated}
      # your code
    ${endIf}
    ```

## GUID vs Application Name

Windows requires to use registry keys (e.g. INSTALL/UNINSTALL info). Squirrel.Windows simply uses application name as key.
But it is not robust — Google can use key Google Chrome SxS, because it is a Google.

So, it is better to use [GUID](http://stackoverflow.com/a/246935/1910191).
You are not forced to explicitly specify it — name-based [UUID v5](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_5_.28SHA-1_hash_.26_namespace.29) will be generated from your [appId](configuration.md#Configuration-appId) or [name](configuration.md#Metadata-name).
It means that you **should not change appId** once your application in use (or name if `appId` was not set). Application product name (title) or description can be safely changed.

You can explicitly set guid using option [nsis.guid](#NsisOptions-guid), but it is not recommended — consider using [appId](configuration.md#Configuration-appId).

It is also important to set the Application User Model ID (AUMID) to the [appId](configuration.md#Configuration-appId) of the application, in order for notifications on Windows 8/8.1 to function and for Window 10 notifications to display the app icon within the notifications by default. The AUMID should be set within the Main process and before any BrowserWindows have been opened, it is normally the first piece of code executed: `app.setAppUserModelId(appId)`

## Portable

To build portable app, set target to `portable` (or pass `--win portable`).

For portable app, following environment variables are available:

* `PORTABLE_EXECUTABLE_DIR` - dir where portable executable located.
* `PORTABLE_EXECUTABLE_APP_FILENAME` - sanitized app name to use in [file paths](https://github.com/electron-userland/electron-builder/issues/3186#issue-345489962).

## Common Questions

??? question "How do change the default installation directory to custom?"

    It is very specific requirement. Do not do if you are not sure. Add [custom macro](#custom-nsis-script):
    
    ```nsis
    !macro preInit
      SetRegView 64
      WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
      WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
      SetRegView 32
      WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
      WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\MyApp"
    !macroend
    ```

??? question "Is it possible to made single installer that will allow configuring user/machine installation?"
    
    Yes, you need to switch to assisted installer (not default one-click).
    
    ```json tab="package.json"
    "build": {
      "nsis": {
        "oneClick": false
      }
    }
    ```
    
    ```yaml tab="electron-builder.yml"
    nsis:
      oneClick: false
    ```
