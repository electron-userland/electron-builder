---
title: "NSIS"
---

The top-level [nsis](./configuration.md#nsis) key contains a set of options instructing electron-builder on how it should build NSIS target (default target for Windows).

These options are also applicable for the [Web installer](#web-installer), use top-level `nsisWeb` key.

---

Unicode enabled by default. Large strings are supported (maximum string length of 8192 bytes instead of the default of 1024 bytes).

## 32 bit + 64 bit

If you build both ia32 and x64 arch (`--x64 --ia32`), you will always get one installer. The appropriate arch will be installed automatically.
The same applied to web installer (`nsis-web` [target](win.md#target)). The same dual-arch installer mechanism also applies to `--x64 --arm64`.

:::note[ia32 requires Electron <= 43]
[Electron 44 removed Windows ia32 builds](https://github.com/electron/electron/pull/51816) — building ia32 requires `electronVersion` <= 43.x (supported until the v43 series reaches end-of-life in January 2027).
:::

## Web Installer

To build web installer, set [target](win.md#target) to `nsis-web`. Web Installer automatically detects OS architecture and downloads corresponding package file. So, the user doesn't need to guess what installer to download and at the same time you don't bundle package files for all architectures in one installer (as in case of default `nsis` target). It doesn't matter for common Electron application (due to superb LZMA compression, size difference is acceptable), but if your application is huge, Web Installer is a solution.

To customize web installer, use the top-level `nsisWeb` key (not `nsis`).

If for some reasons web installer cannot download (antivirus, offline):

- Download package file into the same directory where installer located. It will be detected automatically and used instead of downloading from the Internet. Please note — only original package file is allowed (checksum is checked).
- Specify any local package file using `--package-file=path_to_file`.

## Custom NSIS script

Two options are available — [include](#include) and [script](#script). `script` allows you to provide completely different NSIS script. For most cases it is not required as you need only to customise some aspects, but still use well-tested and maintained default NSIS script. So, `include` is recommended.

:::warning[Custom `script` disables built-in safeguards]
When you provide a custom `script`, electron-builder no longer generates (and signs) the uninstaller for you and skips installer size verification. Prefer `include` unless you really need to replace the whole script.
:::

Keep in mind — if you customize the NSIS script, you should always mention it in issue reports. And don't expect that your issue will be resolved.

:::warning[v27: file-association ProgID format changed]
NSIS installers now register each `fileAssociations` entry under a unique generated **ProgID** (`<program>.<component>`, derived from `productName` + the app GUID) instead of using the association `name`/extension verbatim, which could collide with unrelated apps. `fileAssociations` and its `name`/`ext`/`description` fields are unchanged and nothing needs migrating — **but** if your custom `include`/`script` (or external tooling) hard-codes the old ProgID (the association name or extension) to add shell verbs or registry keys, update it to the new generated value. See [v27 Breaking Changes → NSIS file-association ProgID](./migration/v27-breaking-changes.md#nsis-file-association-progid-format-changed).
:::

1. Add file `build/installer.nsh` (or set [include](#include) explicitly — a single path, or an array of paths that are all included in order, e.g. `"include": ["build/installer.nsh", "build/signing.nsh"]`; each path is resolved relative to the build resources directory first, then relative to the project directory).
2. Define wanted macro to customise: `customHeader`, `preInit`, `customInit`, `customUnInit`, `customInstall`, `customUnInstall`, `customRemoveFiles`, `customInstallMode`, `customWelcomePage`, `customUnWelcomePage`, `customUnInstallSection`.

:::note[Example]

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

!macro customWelcomePage
  # Welcome Page is not added by default for installer.
  !insertMacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "custom title for uninstaller welcome page"
  !define MUI_WELCOMEPAGE_TEXT "custom text for uninstaller welcome page $\r$\n more"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstallSection
  Section /o "un.Some cool checkbox"
    ; You can add some uninstall section as component page
    ; If defined, then always run after `customUnInstall`
  SectionEnd
!macroend
```

:::

- `BUILD_RESOURCES_DIR` and `PROJECT_DIR` are defined.
- `build` is added as `addincludedir` (i.e. you don't need to use `BUILD_RESOURCES_DIR` to `!include` sibling files from the build resources directory).
- `build/x86-unicode` and `build/x86-ansi` are added as `addplugindir` (each one only when the directory exists, regardless of the `unicode` option).
- File associations macro `registerFileAssociations` and `unregisterFileAssociations` are still defined.
- All other electron-builder specific flags (e.g. `ONE_CLICK`) are still defined.

:::note[Uninstaller lifecycle — `customUnInstall` changes take effect one version later]
The uninstaller that runs during an uninstall **or during an update** is the `Uninstall <app>.exe` that was written to disk by the **previously installed** version — not the one embedded in the installer that is currently running. So when you add or change `customUnInstall` (or anything else affecting the uninstaller), the change only becomes active after the _next_ install: version N ships the new uninstaller, and it is first executed when version N is uninstalled or updated to N+1. If your `customUnInstall` "does not fire", it is almost always because the machine still runs the old uninstaller from the previous version.
:::

:::warning[Uninstall registry key — do not hard-code `...\Uninstall\<appId>`]
electron-builder registers the uninstall entry under `Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}`, where `UNINSTALL_APP_KEY` is the application **GUID** (with each `\` replaced by " - ", i.e. space, hyphen, space) — _not_ the `appId`. In a custom script use the provided defines instead of building the path yourself: `${UNINSTALL_REGISTRY_KEY}` (the full key, see `multiUser.nsh`) or `${UNINSTALL_APP_KEY}`. A hard-coded `Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}` points at a key electron-builder never writes.
:::

If you want to include additional resources for use during installation, such as scripts or additional installers, you can place them in the `build` directory and include them with `File`. For example, to include and run `extramsi.msi` during installation, place it in the `build` directory and use the following:

```nsis
!macro customInstall
  File /oname=$PLUGINSDIR\extramsi.msi "${BUILD_RESOURCES_DIR}\extramsi.msi"
  ExecWait '"msiexec" /i "$PLUGINSDIR\extramsi.msi" /passive'
!macroend
```

:::tip[Is there a way to call just when the app is installed (or uninstalled) manually and not on update?]
Use `${isUpdated}`.

```nsis
${ifNot} ${isUpdated}
  # your code
${endIf}
```

:::

## GUID vs Application Name

Windows requires to use registry keys (e.g. INSTALL/UNINSTALL info). Squirrel.Windows simply uses application name as key.
But it is not robust — Google can use key Google Chrome SxS, because it is a Google.

So, it is better to use [GUID](http://stackoverflow.com/a/246935/1910191).
You are not forced to explicitly specify it — name-based [UUID v5](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_5_.28SHA-1_hash_.26_namespace.29) will be generated from your [appId](./configuration.md#appid) or [name](configuration.md#metadata).
It means that you **should not change appId** once your application in use (or name if `appId` was not set). Application product name (title) or description can be safely changed.

You can explicitly set guid using option [nsis.guid](#guid), but it is not recommended — consider using [appId](./configuration.md#appid).

It is also important to set the Application User Model ID (AUMID) to the [appId](./configuration.md#appid) of the application, in order for notifications on Windows 8/8.1 to function and for Window 10 notifications to display the app icon within the notifications by default. The AUMID should be set within the Main process and before any BrowserWindows have been opened, it is normally the first piece of code executed: `app.setAppUserModelId(appId)`

## Portable

To build portable app, set target to `portable` (or pass `--win portable`).

For portable app, following environment variables are available:

- `PORTABLE_EXECUTABLE_FILE` - path to the portable executable.
- `PORTABLE_EXECUTABLE_DIR` - directory where the portable executable is located.
- `PORTABLE_EXECUTABLE_APP_FILENAME` - sanitized app name to use in [file paths](https://github.com/electron-userland/electron-builder/issues/3186#issue-345489962).

The portable target also supports a custom NSIS script via `portable.include` (a single path or an array of paths). Unlike the installer targets, `build/installer.nsh` is **not** auto-discovered for portable builds — a custom script is only included when the option is explicitly set, so an `installer.nsh` written for the installer target does not silently leak into portable builds.

## Common Questions

:::tip[How do I change the default installation directory?]

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

:::

:::tip[Is it possible to make a single installer that will allow configuring user/machine installation?]

Yes, you need to switch to assisted installer (not default one-click).

package.json

```json
"build": {
  "nsis": {
    "oneClick": false
  }
}
```

electron-builder.yml

```yaml
nsis:
  oneClick: false
```

:::

## Configuration

{!./app-builder-lib.Interface.NsisOptions.md!}
