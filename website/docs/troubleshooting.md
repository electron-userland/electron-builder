# Troubleshooting

This page covers common errors by category. Enable verbose logging to get more detail:

```bash
DEBUG=electron-builder electron-builder build
```

## Code Signing

### macOS

**"No identity found for code signing"**
: No Developer ID certificate is installed. Run `security find-identity -v -p codesigning` to list available identities. On CI, verify `CSC_LINK` is set and contains a valid base64-encoded `.p12`.

**"CSSMERR_TP_CERT_REVOKED"**
: Your certificate was revoked by Apple. Renew it in the Apple Developer portal.

**"The certificate has expired"**
: Renew the certificate in Apple Developer portal, re-export it, and update your CI secrets.

**Build produces unsigned output without an error**
: `CSC_LINK` isn't set, so electron-builder silently skips signing. Set `forceCodeSigning: true` to turn this into a build failure so you catch it early.

**"Keychain not unlocked" / codesign hangs**
: Verify `CSC_LINK` and `CSC_KEY_PASSWORD` are set correctly — electron-builder creates a temporary keychain and runs all required setup commands, including `set-key-partition-list`, automatically. If using a manually managed keychain (via `CSC_KEYCHAIN`), ensure you run `security set-key-partition-list -S apple-tool:,apple: -s -k <password> <keychain>` after importing.

**"App cannot be opened because the developer cannot be verified"** (Gatekeeper)
: The app is unsigned, signed with the wrong certificate type (e.g., Mac App Store cert used for direct distribution), or not notarized. Check the certificate type and notarization status with `spctl --assess --verbose dist/mac/MyApp.app`.

### macOS Notarization

**"Package Invalid: the binary is not signed with a valid Developer ID certificate"**
: You used an Apple Distribution / Mac App Store certificate. Notarization for direct distribution requires a Developer ID Application certificate.

**"The executable does not have the Hardened Runtime enabled"**
: Add `hardenedRuntime: true` to your `mac` config. Also ensure entitlements include `com.apple.security.cs.allow-jit`.

**"Notarization failed: invalid credentials"**
: The `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` combination is wrong, or the app-specific password was revoked. Regenerate it at [appleid.apple.com](https://appleid.apple.com).

**"Notarization timed out"**
: Apple's notarization service may be slow. Run again later. Check [Apple System Status](https://developer.apple.com/system-status/).

### Windows

**SmartScreen warning at install time**
: Normal for standard OV certificates — trust builds over time based on download count. EV certificates bypass this. No fix needed; warn users in your release notes that the warning is expected.

**"Publisher does not match" (AppX)**
: The `appx.publisher` value in your config must exactly match the Subject field in your certificate. Copy it from the certificate's Properties → Details → Subject.

**"SignTool error: No certificates were found that met all the given criteria"**
: The certificate isn't in the certificate store, or `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are wrong. Verify the base64 decodes to a valid `.pfx` and that the password is correct.

---

## ASAR and File Packaging

**Native module crashes at runtime: "Error: Module did not self-register"**
: The native module (`.node` file) is inside the ASAR archive, but native modules can't load from inside ASAR. Add to `asarUnpack`:
```yaml
asarUnpack:
  - "node_modules/your-module/**"
  - "**/*.node"
```

**"ENOENT: no such file or directory" at runtime**
: A file that exists in development is missing from the packaged app. Check if it's being excluded by a `files` pattern or by the default exclusions. Build with `DEBUG=electron-builder` and look for "excluding" log lines. Also check `asarUnpack` — files inside ASAR must be accessed via `app.getAppPath()`, not via `__dirname` relative paths.

**App directory is too large**
: Profile the ASAR after building:
```bash
npx asar list dist/mac/MyApp.app/Contents/Resources/app.asar | sort
```
Common culprits: TypeScript source files (`.ts`), source maps (`.map`), test fixtures, large binary assets. Add exclusion patterns to `files`:
```yaml
files:
  - "**/*"
  - "!src/**"
  - "!**/*.ts"
  - "!**/*.map"
  - "!**/__tests__/**"
```

**"Cannot find module" at runtime after packaging**
: A production dependency isn't being included. Check that it's in `dependencies` (not `devDependencies`) in `package.json`. electron-builder only includes production dependencies.

**FileSet `from` path not found**
: In `files`, the `from` path is relative to the **app directory**. In `extraResources` / `extraFiles`, `from` is relative to the **project root**. These are different when `directories.app` is set.

---

## Native Modules

**"Error: The module was compiled against a different Node.js version"**
: electron-builder automatically rebuilds native modules for the target Electron version during the build. If you see this error at runtime during development (not during a build), ensure you are running your app via `electron .` from the project root, not from a globally installed Electron binary compiled against a different version.

**Native module works in development but crashes after packaging**
: The module likely needs to be in `asarUnpack`. Some modules also need their full directory tree unpacked:
```yaml
asarUnpack:
  - "node_modules/better-sqlite3/**"
  - "node_modules/sharp/**"
```

---

## Auto-Update

**Updates not detected: app reports "up to date" when a new version exists**
: Check that the `publish` configuration matches your distribution channel. For GitHub, ensure the release isn't a draft (draft releases are invisible to electron-updater). Verify `app.getVersion()` matches the version in `package.json` at build time.

**"Cannot find latest.yml" / update server 404**
: electron-builder generates `latest.yml` (Windows), `latest-mac.yml` (macOS), or `latest-linux.yml` only when publishing. Ensure you ran `--publish always` (or `--publish onTagOrDraft`) when building the release.

**"sha512 checksum mismatch"**
: The downloaded update file is corrupt or the wrong file is being served. Verify that the artifact and the `.yml` metadata file were generated together in the same build and not mixed from different builds.

**Delta updates (AppImage / NSIS-Web) fail**
: For AppImage delta updates, electron-builder embeds a blockmap directly in the AppImage binary — no separate file needs to be published. If delta updates aren't working, verify the AppImage was built with electron-builder and that a publish provider is configured. For NSIS differential packages, `nsis.differentialPackage` must be `true`.

---

## Build Environment

**"Cannot find module 'electron'"**
: `electron` must be in `devDependencies`, not `dependencies`. electron-builder expects to find it in the project's devDependencies to determine the Electron version to bundle.

**"Resource does not exist" when downloading Electron**
: The Electron version specified in your devDependencies doesn't exist for the target architecture. Check [Electron releases](https://github.com/electron/electron/releases) to confirm the version and architecture combination exists.

**Build hangs with no output**
: Often caused by a native module rebuild that's hanging. Run with `DEBUG=electron-builder` and check the last log line. Also check if a spawned process is waiting for input (some postinstall scripts do this).

**Out-of-memory error during packaging**
: Large apps can exhaust memory during ASAR creation. Set `NODE_OPTIONS=--max-old-space-size=4096` before running electron-builder.

**Build fails in an offline / air-gapped environment**
: electron-builder downloads build toolsets (e.g. WinCodeSign, AppImage tools) the first time they are needed, then caches the archive at `<ELECTRON_BUILDER_CACHE>/<releaseName>/<filename>`. On every subsequent build it reads from that cache and makes no network request.

For a first-time setup in a fully air-gapped environment, run the build once on a machine with internet access so the cache is populated, then copy the entire `ELECTRON_BUILDER_CACHE` directory to the air-gapped machine. Point both machines at the same directory with `ELECTRON_BUILDER_CACHE=/path/to/shared/cache`.

**"Downloading" progress appears for an artifact that should be cached**
: The toolset archive cache lives inside `ELECTRON_BUILDER_CACHE` (default: `~/Library/Caches/electron-builder` on macOS, `%LOCALAPPDATA%/electron-builder/Cache` on Windows, `~/.cache/electron-builder` on Linux). If this directory is cleared or not persisted between builds (common on ephemeral CI runners), the archive is re-downloaded. Persist the cache directory across CI runs to avoid repeated downloads.

---

## Linux-Specific

**"fpm not found"**
: The DEB, RPM, Pacman, APK, FreeBSD, and P5P targets use FPM internally. electron-builder bundles FPM — if it fails to find it, try reinstalling electron-builder or clearing `~/.cache/electron-builder`.

**AppImage won't run: "FUSE not found" / "fusermount not found"**
: The AppImage runtime requires FUSE. Install it:
```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs
```
Or run with `--appimage-extract-and-run`:
```bash
./MyApp.AppImage --appimage-extract-and-run
```

**AppImage won't run: "squashfs: FATAL ERROR aborting"**
: Try the newer AppImage toolset:
```yaml
toolsets:
  appimage: "1.0.3"
```

**Flatpak build fails: "runtime not found"**
: Install the Flatpak runtime before building:
```bash
flatpak install flathub org.freedesktop.Platform//24.08
flatpak install flathub org.freedesktop.Sdk//24.08
```

**Snap confinement issues: permission denied at runtime**
: The snap is trying to access something not declared in its interface plugs. Run `snap run --shell myapp` to get a shell inside the snap, then test access. Add the appropriate plug to `snap.plugs` in your config.

---

## macOS-Specific

**DMG window layout doesn't look right**
: DMG window positions are set by the macOS system and can behave unexpectedly if the dimensions in `dmg.window.size` don't match the `contents` positions. Ensure icon positions fit within the window bounds with some padding. Test by opening the built DMG manually.

**"App is damaged and can't be opened"**
: Usually means the app was downloaded without Gatekeeper quarantine being cleared, and notarization failed or wasn't performed. Run `xattr -dr com.apple.quarantine /path/to/app` temporarily during testing. Ensure notarization succeeds before distributing.

**PKG installer fails: "The package … is not compatible with this version of macOS"**
: Check `pkg.minVersion` matches your actual minimum supported macOS version.

**"The application cannot be opened" on Apple Silicon**
: The app may be x64-only but running on an ARM Mac without Rosetta. Either build a universal binary or ensure Rosetta 2 is installed (`softwareupdate --install-rosetta`).

---

## Windows-Specific

**NSIS installer: "The installer you are trying to use is corrupt or incomplete"**
: The installer binary is corrupted. This can happen when the file is scanned/modified by antivirus during download or build. Check your AV exclusions during builds.

**"The publisher could not be verified" (Windows SmartScreen)**
: The app isn't code-signed, or signed with an untrusted certificate. See [Windows Code Signing](features/code-signing/code-signing-win.md).

**MSI: upgrades don't remove the old version**
: The `upgradeCode` was changed between versions. The `upgradeCode` (a GUID) must remain **identical** across all versions of your application. See [MSI Configuration](msi.md).

**AppX installation fails: "The package could not be installed"**
: Common causes: certificate not trusted on the target machine; `publisher` in config doesn't match certificate Subject; Windows version below the `minVersion` requirement. Check Event Viewer → Applications and Services Logs → Microsoft → Windows → AppxPackagingOM for detailed error codes.

---

## Docker / Cross-Platform Builds

**Linux build on macOS/Windows hangs or fails**
: Use the official Docker image:
```bash
docker run --rm -ti \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "npm ci && npx electron-builder --linux"
```

**"wine: command not found" when building Windows on Linux**
: Use the `electronuserland/builder:wine` Docker image which includes Wine. Or install Wine on the host system.

---

## Getting More Help

- Run `DEBUG=electron-builder electron-builder build 2>&1 | tee build.log` to capture full debug output
- Search [GitHub Issues](https://github.com/electron-userland/electron-builder/issues)
- Check the [Discussions](https://github.com/electron-userland/electron-builder/discussions)
