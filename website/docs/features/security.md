---
title: "Security & Hardening"
---

# Security & Hardening

electron-builder aims to be secure-by-default across the whole release pipeline — from how updates are verified, to how your app's contents are integrity-checked, to how artifacts are signed and published. This page is a map of those controls; each section links out to the detailed guide rather than repeating it.

:::info[v27 tightened several defaults]
Several security-relevant defaults changed in v27 — auto-update web installers, update-metadata format, and explicit publishing. If you are upgrading, read this page alongside the [v27 Breaking Changes](../migration/v27-breaking-changes.md).
:::

## Update security (electron-updater)

- **Web-installer payloads are disabled by default.** `AppUpdater.disableWebInstaller` now defaults to **`true`**. NSIS *web* installers (the small installer that downloads its full payload at install time from a manifest-supplied URL) are no longer loaded unless you opt in, because that payload may not undergo signature verification. v27 ships a one-major grace period: if a web-installer update is received and you never set the flag, the updater logs a warning and still downloads it. Set `autoUpdater.disableWebInstaller = false` only if you intentionally ship a web installer.

- **Linux package signatures.** `AppUpdater.allowUnverifiedLinuxPackages` (default **`true`**) preserves historical behavior, since electron-builder does not sign Linux packages itself. Set it to **`false`** to enforce GPG signature checks when installing `.deb` / `.rpm` auto-updates on package managers that support verification.

- **Modern, verified update metadata.** Generated `latest*.yml` targets the `files[]` format and the default `electronUpdaterCompatibility` is now `>=2.16`. Update metadata validated only by the legacy SHA-256 `sha2` checksum is deprecated.

- **Windows update signature verification.** On Windows, downloaded NSIS updates are Authenticode-verified before they are applied. `win.verifyUpdateCodeSignature` (default `true`) embeds your signing `publisherName` into `app-update.yml`, and electron-updater checks each downloaded update against the certificate subject. Supply an array of `publisherName` values when rotating certificates so updates signed by either the old or new certificate still verify.

:::warning[Two of these fail-close in v28]
v27 is a grace period. In **v28**, an unblocked web-installer update becomes an error (`ERR_UPDATER_WEB_INSTALLER_DISABLED`), and `sha2`-only update metadata is **rejected (fail-closed)**. Confirm your updates use a signed full installer and modern `files[]` metadata before upgrading to v28.
:::

**See also:** [Auto Update](./auto-update.md) · [Update metadata & compatibility](./auto-update.md#compatibility)

## Package integrity

Two independent mechanisms protect the code inside your packaged app:

- **ASAR integrity.** When your app is packaged into an `app.asar` archive (the default), electron-builder embeds integrity hashes so Electron can detect a tampered or swapped archive at runtime. It is on by default; `asar.disableIntegrity: true` disables it (not recommended). See the [ASAR options](../migration/v27-breaking-changes.md#asar-options-asar) for the v27 config shape.

- **Electron Fuses.** Fuses are "magic bits" flipped at package time — *before* code signing — that disable risky Electron features for the entire app (e.g. `runAsNode`, `enableNodeCliInspectArguments`, `enableNodeOptionsEnvironmentVariable`). Pairing `enableEmbeddedAsarIntegrityValidation` with `onlyLoadAppFromAsar` binds the app to its verified ASAR. Because the bits are flipped before signing, the OS (Gatekeeper / App Locker) is responsible for ensuring they can't be flipped back.

**See also:** [Adding Electron Fuses](../tutorials/adding-electron-fuses.md)

## Code signing & notarization

Signing proves your app's identity and lets the OS confirm it hasn't been tampered with since it was signed. On macOS, notarization is additionally required for Gatekeeper when distributing outside the Mac App Store. electron-builder discovers signing credentials from the environment and signs automatically when they are present.

- **macOS signing** (Developer ID, `mac.sign`) — [macOS Signing](./code-signing/code-signing-mac.md)
- **Windows signing** — signtool, HSM, PKCS#11, and Azure Trusted Signing via the `win.sign` discriminated union — [Windows Signing](./code-signing/code-signing-win.md)
- **Apple notarization** — [Notarization](./code-signing/notarization.md)

**See also:** [Code Signing overview](./code-signing/code-signing.md)

## Safe publishing

v27 **removed implicit `--publish`**. Earlier versions could auto-publish based on the presence of CI tag environment variables, git tags, or npm lifecycle events — which risked accidentally exposing secrets or shipping unfinished releases. v27 never publishes unless you ask it to: pass `--publish <always|onTag|onTagOrDraft|never>` explicitly in your release scripts, or set the `publish` option in your configuration.

```bash
electron-builder --publish always   # explicit — required in v27
```

**See also:** [Publish configuration](../publish.md) · [Implicit `--publish` removed](../migration/v27-breaking-changes.md#implicit-publish-removed)

## Toolset integrity

The external build toolsets electron-builder downloads (NSIS, winCodeSign, AppImage, Wine, FPM, …) are checksum-verified after download and cached, so a corrupted or substituted bundle is rejected. When you supply a **custom** toolset from a remote `url`, a `checksum` is **required**; a local `file://` directory is used as-is and needs no checksum.

```json5
{
  "build": {
    "toolsets": {
      "nsis": {
        "url": "https://example.com/my-nsis-bundle.tar.gz",
        "checksum": "sha256:abc123…"
      }
    }
  }
}
```

**See also:** [Toolsets](../toolsets.md) · [Custom toolset bundles](../migration/v27-breaking-changes.md#toolset-env-var-overrides-removed)
