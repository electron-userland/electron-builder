# Glossary

Quick reference for terms used throughout the electron-builder documentation.

---

## A

**Ad-hoc signing**
: A macOS code signature that identifies the binary but isn't tied to an Apple developer identity. Used for local development on Apple Silicon. Set `mac.identity` to `"-"` to request ad-hoc signing. Unlike a proper Developer ID signature, ad-hoc signatures are not trusted by Gatekeeper for distribution.

**AppImage**
: A self-contained Linux application format. A single executable file that runs on any Linux distribution without installation. Users download the file, mark it executable (`chmod +x`), and run it. The default Linux target for electron-builder. See [AppImage](appimage.md).

**AppX / MSIX**
: Microsoft's modern app packaging format for the Windows Store and enterprise MDM deployment. electron-builder's `appx` target produces `.appx` files. Microsoft's newer `.msix` format is functionally similar. See [AppX](appx.md).

**ASAR**
: **A**tom **S**hell **AR**chive — Electron's archive format for bundling application source files. Similar to a `tar` file but optimized for random access. Files inside ASAR are read through Electron's virtual filesystem. Native modules (`.node` files) must be excluded via `asarUnpack`.

**asarUnpack**
: A configuration option listing glob patterns for files that should be placed in `app.asar.unpacked/` rather than inside the ASAR archive. Required for native modules and large binaries that need direct filesystem access.

---

## C

**CA (Certificate Authority)**
: An organization that issues and vouches for digital certificates. For Windows code signing, any major CA (DigiCert, Sectigo, SSL.com) works. For macOS, only Apple-issued certificates are recognized by Gatekeeper.

**CFBundleIdentifier**
: The unique reverse-DNS identifier for a macOS application bundle (e.g., `com.company.myapp`). Set via `appId` in electron-builder config. Must be unique across all apps on a user's machine and within the App Store.

**CSC (Code Signing Certificate)**
: The prefix for environment variables that provide code signing credentials to electron-builder (`CSC_LINK`, `CSC_KEY_PASSWORD`, etc.). See [Code Signing](features/code-signing/code-signing.md).

---

## D

**DMG**
: **D**isk i**M**a**G**e — the standard macOS distribution format. A virtual disk that mounts when double-clicked, showing the app icon and an Applications shortcut for drag-and-drop installation. See [DMG](dmg.md).

**Developer ID**
: An Apple code signing certificate type for apps distributed outside the Mac App Store. Comes in two forms: "Developer ID Application" (for signing app bundles) and "Developer ID Installer" (for signing PKG installers). Both require Apple Developer Program membership.

---

## E

**Entitlements**
: macOS security declarations that grant your app specific capabilities. Required when Hardened Runtime is enabled. Stored in `.plist` XML files referenced by `mac.entitlements` and `mac.entitlementsInherit`. Examples: `com.apple.security.cs.allow-jit` (required by Electron), `com.apple.security.network.client` (outbound networking).

**EV Certificate (Extended Validation)**
: A Windows code signing certificate with higher trust than standard OV certificates. EV certificates are physically bound to a USB security key and cannot be exported — which makes them incompatible with most CI/CD systems. SmartScreen immediately trusts EV-signed installers without requiring a reputation-building period.

---

## F

**Flatpak**
: A Linux packaging system that runs apps in a sandbox with controlled system access. Apps declare required permissions via "finish args." electron-builder produces single-file Flatpak bundles (not Flathub repository packages). See [Flatpak](flatpak.md).

**FPM (Effing Package Management)**
: A command-line tool used internally by electron-builder to create DEB, RPM, Pacman, APK, FreeBSD, and P5P packages. You generally don't interact with it directly; use `fpm` passthrough options in your config for advanced cases.

**Fuses**
: Feature flags embedded in the Electron binary that control security-sensitive behaviors at build time. Unlike runtime flags, fuses cannot be changed after the app is packaged. See [Adding Electron Fuses](tutorials/adding-electron-fuses.md).

---

## G

**Gatekeeper**
: Apple's security system that checks apps for valid code signatures and (on macOS 10.15+) notarization before allowing them to run. An app without a valid Developer ID signature prompts a security warning or is blocked entirely.

**GUID (Globally Unique Identifier)**
: A 128-bit identifier used by Windows installers to track application identity across installs and upgrades. In NSIS, this is the `guid` option. In MSI, this is the `upgradeCode`. **Critical:** changing the GUID between releases breaks silent upgrades of existing installations.

---

## H

**Hardened Runtime**
: A macOS security mode (`hardenedRuntime: true`) that restricts what your app can do without explicit entitlement declarations. Required for notarization. It blocks JIT compilation, unsigned library loading, and other potentially dangerous operations unless granted via entitlements.

---

## I

**IDP (Installer Data Package / P5P)**
: Solaris IPS (Image Packaging System) package format. electron-builder's `p5p` target produces packages for Solaris and illumos-based distributions.

---

## K

**Keychain**
: macOS's system for storing credentials, certificates, and keys. electron-builder reads code signing certificates from the keychain. On CI, you create a temporary keychain, import the certificate, and unlock it before building.

---

## M

**MAS (Mac App Store)**
: Apple's app distribution platform for macOS. MAS apps are sandboxed and require entitlements for any system access. electron-builder's `mas` target builds for App Store submission; `mas-dev` builds for local testing with a development provisioning profile. See [MAS](mas.md).

**MSIX**
: Microsoft's evolution of AppX packaging. Functionally identical for electron-builder purposes — the `appx` target produces files compatible with both.

---

## N

**Notarization**
: Apple's service that scans your app for malware and issues a cryptographic ticket confirming the scan. Required for distributing apps outside the Mac App Store on macOS 10.15+. electron-builder handles notarization automatically when `mac.notarize: true`. See [Notarization](features/code-signing/notarization.md).

**NSIS (Nullsoft Scriptable Install System)**
: The Windows installer framework used by electron-builder's `nsis` and `nsis-web` targets. Produces highly customizable `.exe` installers. The default Windows target. See [NSIS](nsis.md).

---

## O

**OV Certificate (Organization Validated)**
: A standard Windows code signing certificate that requires organizational identity verification. Unlike EV certificates, OV certificates can be exported as `.pfx` files and used in CI/CD. SmartScreen trust builds gradually based on how many users have downloaded and run the installer.

---

## P

**PKG**
: macOS installer package format. Used when your app needs to install files outside `/Applications`, run pre/post-install scripts, or install system components like launch daemons. Requires a separate "Developer ID Installer" certificate. See [PKG](pkg.md).

**Portable**
: A Windows build target that produces a single `.exe` file requiring no installation. The app runs directly without writing to the registry or creating Start menu entries. See the Windows targets section in [NSIS](nsis.md).

**Provisioning Profile**
: A macOS/iOS file that ties a certificate, an App ID, and a set of entitlements together. Required for Mac App Store submissions (`mas` target). Obtained from the Apple Developer portal.

---

## S

**Sandbox**
: An isolation mechanism that restricts what an application can access. Flatpak and Snap use sandboxes on Linux. Mac App Store apps are sandboxed by Apple's App Sandbox framework. Sandboxed apps must declare all required permissions.

**Signing Identity**
: The name of a code signing certificate as it appears in the macOS Keychain (e.g., `Developer ID Application: My Company (ABCDE12345)`). Referenced by `CSC_NAME` or `mac.identity` in electron-builder config.

**SmartScreen**
: Windows Defender's application reputation service. It warns users when they run unsigned apps or apps from publishers with low download reputation. EV certificates bypass the reputation-building period; standard OV certificates require time.

**Snap**
: Canonical's Linux packaging format, primarily for Ubuntu. Snap apps run in a sandbox with declared "interface plugs" controlling system access. electron-builder's `snap` target produces Snap packages for Snap Store distribution. See [Snap](snap.md).

**Squirrel**
: A Windows auto-update framework. electron-builder's `squirrel.windows` target is a legacy option — new projects should use NSIS with electron-updater instead. See [Squirrel.Windows](squirrel-windows.md).

**Stapling**
: Attaching a notarization ticket to an app bundle so that Gatekeeper can verify notarization offline (without contacting Apple's servers). electron-builder staples the ticket automatically after notarization completes.

---

## U

**Universal Binary**
: A macOS binary that contains both x64 (Intel) and arm64 (Apple Silicon) code. The OS selects the appropriate slice at launch. Build with `--universal` or `arch: universal`. Results in a ~2× larger download but runs natively on all modern Macs.

**UpgradeCode**
: A GUID in MSI packages that identifies the application across versions for upgrade and uninstall operations. Must remain constant across all versions. Changing the UpgradeCode breaks silent upgrades and leaves old versions orphaned on managed systems. See [MSI](msi.md).

---

## W

**WiX (Windows Installer XML Toolset)**
: The toolchain used by electron-builder internally to produce MSI packages. Provides advanced Windows installer features like component tracking, repair, and rollback. You can pass additional WiX arguments via `msi.additionalWixArgs`.

---

## Z

**zsync**
: A file synchronization protocol used by AppImage for differential updates. When publishing AppImages, electron-builder generates a `.AppImage.zsync` file. electron-updater uses zsync to download only the changed blocks of a new version rather than the full AppImage.
