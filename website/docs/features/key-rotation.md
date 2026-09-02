---
title: "Key Rotation"
---

# Key Rotation

This page is a runbook for rotating the keys that an Electron app's release pipeline depends on: the **Ed25519 key that signs update manifests** and the **platform code-signing certificates** for Windows, macOS, and Linux. It is written for maintainers who already ship auto-updating apps with electron-builder and electron-updater.

## Why rotation is a transition problem

Every install in the field trusts exactly what it was built with. electron-updater does not fetch trust anchors from your update server, and there is no revocation list it consults. Concretely:

| Trust anchor | Where it is fixed | What checks it |
| --- | --- | --- |
| Update-manifest public key (`updateManifestPublicKey`) | `app-update.yml`, written at build time | electron-updater, on every platform, before any download ([Signed Update Manifests](./signed-update-manifests.md)) |
| Windows publisher name (`publisherName`) | `app-update.yml`, written at build time | electron-updater (NSIS target), against the Authenticode signature of the downloaded installer |
| macOS Team ID | The running app's code signature | Squirrel.Mac, when it installs the downloaded update |
| Linux repository GPG key | The user's package-manager keyring | `apt` / `dnf` / `zypper`, only when `allowUnverifiedLinuxPackages` is `false` |

Because the anchor travels *inside* the previous release, you cannot simply start signing with a new key: installs that trust the old anchor would reject everything you publish from that point on. Rotation is therefore always a **transition window**: you first ship a release that installs the new anchor while still passing the old check, wait for it to reach your users, and only then switch.

### The bridge release

Throughout this page, a **bridge release** is an ordinary release with one property: it is *verified with the old key* and *carries the new trust anchor*. Users who install it will accept updates signed with the new key; users who never install it stay pinned to the old key. The remaining sections describe what "carries the new anchor" means for each mechanism, and how long you may need to keep the old key alive.

:::tip[Plan the window before you need it]
Rotation is much calmer when it is routine. Decide in advance how you will measure adoption of a bridge release (download counts on your update server, telemetry, or simply time elapsed against your `stagingPercentage` schedule) and what you will do with installs that never update.
:::

## Rotating the update-manifest signing key (Ed25519)

electron-builder signs `latest*.yml` with an Ed25519 private key and embeds the matching public key into `app-update.yml`; electron-updater verifies the manifest with that public key before downloading anything. See [Signed Update Manifests](./signed-update-manifests.md) for the feature itself. Three facts drive the rotation procedure:

1. **The private key is resolved from, in order:** `updateManifest.signingKey` → `updateManifest.signingKeyFile` → `EP_UPDATE_SIGN_KEY` → `EP_UPDATE_SIGN_KEY_FILE`. Whichever is found first signs every manifest for that platform.
2. **The embedded public key is either explicit or derived.** If `updateManifest.publicKey` is set it is embedded as-is; otherwise the public half of the signing key is derived and embedded. This is what makes a bridge release possible: you can sign with key A while embedding key B.
3. **An install trusts exactly one key.** `updateManifestPublicKey` is a single value. There is no list of accepted keys and no grace period; verification is fail-closed as soon as a key is configured.

:::note[Platform blocks replace, they don't merge]
A platform-specific `updateManifest` block (for example `linux.updateManifest`) *replaces* the top-level `updateManifest` block for that platform rather than being merged with it. If you set `publicKey` at the top level but also have a per-platform block, put `publicKey` in the per-platform block too.
:::

### Step by step

**1. Generate the new keypair.** Run this on a trusted machine, not in a shared CI log:

```sh
npx electron-builder create-update-key --out ./update-private-key.new.pem
```

The private key is written with mode `0600`; the public key is printed to stdout. Copy the public key (the whole `-----BEGIN PUBLIC KEY-----` block) somewhere you can paste it into config, and store the private key as a **new** CI secret alongside the old one. Do not replace the old secret yet.

**2. Ship the bridge release: sign with the OLD key, embed the NEW public key.** Keep the old private key in the environment as before, and add the new public key to your build configuration:

```yaml
# electron-builder.yml
updateManifest:
  # NEW public key, embedded into app-update.yml of this release
  publicKey: |
    -----BEGIN PUBLIC KEY-----
    MCowBQYDK2VwAyEA...
    -----END PUBLIC KEY-----
```

```sh
# OLD private key still signs latest*.yml
EP_UPDATE_SIGN_KEY_FILE=/run/secrets/update-private-key.old.pem electron-builder --publish always
```

Installs in the field verify this release's manifest with the old key, accept it, and after updating trust the new key. Nothing else about the release needs to change; combine it with a normal feature release if you like.

**3. Wait for adoption.** Until the bridge release has reached the installs you care about, keep publishing with the old key (and keep `updateManifest.publicKey` pointing at the new key, so every release in this window is also a bridge release).

**4. Switch the signing key.** Point the environment at the new private key and remove the explicit `publicKey` (derivation now yields the same key):

```sh
EP_UPDATE_SIGN_KEY_FILE=/run/secrets/update-private-key.new.pem electron-builder --publish always
```

From this release on, manifests are signed with the new key. Installs that took the bridge release verify them; installs that skipped it fail with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` and stop updating.

**5. Deal with stragglers.** A `latest*.yml` carries one signature, so a single feed cannot satisfy both old and new installs after the switch. Your options are:

- **Accept it** and tell users on very old versions to reinstall from your download page.
- **Serve a separate feed.** Keep an additional channel or URL (for example `latest-legacy.yml` on a different `channel`) whose manifests are still signed with the old key, and have the old app builds point at it. This only works if the old builds can be steered there (`autoUpdater.channel`, `setFeedURL`, or a feed URL you controlled at the time).
- **Runtime override.** Newer app code can set `autoUpdater.updateManifestPublicKey` explicitly; this overrides the value from `app-update.yml`, which is useful if the key must change between builds without a rebuild of `app-update.yml`, but it does not help installs that are already in the field.

**6. Retire the old key.** Once no feed is signed with it, delete the old private key from CI. Keep the *public* key on file for auditing.

### If the private key is compromised

An attacker holding the private key can produce a `latest*.yml` that every current install will accept, provided they can also place it (and a payload) on your update server or intercept the connection. Rotation is the only remedy; there is no revocation mechanism.

1. **Lock down the feed first.** Revoke the publish credentials (`GH_TOKEN`, S3/R2 keys, and so on) and audit the manifests currently served. The manifest signature protects the metadata, but only if the storage it is served from has not already been overwritten.
2. **Ship the bridge release immediately** (steps 1–2 above). It must still be signed with the compromised key, because that is the only key the installs trust; you are racing the attacker, so publish from a clean pipeline.
3. **Switch to the new key as soon as adoption allows** (step 4) and never sign with the old key again.
4. Because verification is fail-closed, once installs trust the new key, anything the attacker signs with the old one is rejected with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`. Unsigned manifests are rejected with `ERR_UPDATER_MANIFEST_NOT_SIGNED`.

### Key storage

- **Never commit the private key.** `updateManifest.signingKey` exists for completeness; in practice use `EP_UPDATE_SIGN_KEY` (PEM contents) or `EP_UPDATE_SIGN_KEY_FILE` (path to a mounted secret file) from your CI secret store.
- Prefer the `_FILE` variant where your CI can mount secrets as files; it keeps the key out of process listings and environment dumps.
- If the private key lives in an HSM or KMS that signs on your behalf, electron-builder cannot call it directly. Sign `latest*.yml` in a post-publish step of your own, and set `updateManifest.publicKey` so the correct public key is still embedded.
- Use one key per app (or per release channel if channels are operated by different teams). Sharing a key across unrelated apps means one compromise affects all of them.

## Windows: code-signing certificate rotation

Two things happen when a Windows certificate changes: the OS and SmartScreen see a new signer (reputation may need to be rebuilt for an OV certificate), and **electron-updater checks the new signature against the publisher name embedded in the app**. Only the second is electron-builder's concern.

### How the updater checks the certificate

When `win.verifyUpdateCodeSignature` is `true` (the default), electron-builder writes the resolved publisher name into `app-update.yml` as `publisherName`. It is either what you configured in `win.sign.publisherName` (a string or an array) or, when not configured, the Common Name of the signing certificate. At update time the NSIS updater reads that value and runs `Get-AuthenticodeSignature` on the downloaded installer:

- The installer must carry a **valid** Authenticode signature.
- The signer's Subject is compared against **each** configured publisher name. A full Distinguished Name (`CN=..., O=..., C=...`) matches when every component you listed equals the certificate's; a bare `CN=` value matches on the Common Name alone (with a warning asking you to configure the full DN).
- If **any** entry matches, the update is installed. If none matches, the update is rejected.
- If `app-update.yml` has no `publisherName` at all, verification is skipped with a deprecation warning (this fail-open behavior becomes fail-closed in v28).

The same check runs again before an [install-on-next-launch](./auto-update.md#install-on-next-launch-windowslinux) installer is executed.

### Renewal vs. rotation

- **Renewal with the same Subject** (same CA, same legal entity, same DN): the embedded publisher name still matches and existing installs update without any special release. Verify the DN is byte-for-byte identical: a changed `O=`, `L=`, or `C=` component is a rotation, not a renewal, if you configured a full DN.
- **Rotation to a certificate with a different Subject** (new CA, company rename, moving to Azure Trusted Signing, switching from OV to EV): existing installs will reject installers signed with it until they have received a bridge release.

### Step by step

**1. Ship the bridge release with both names.** Before signing anything with the new certificate, publish a release (still signed with the **old** certificate) whose `win.sign.publisherName` lists both subjects:

```yaml
win:
  sign:
    type: signtool            # or hsm / pkcs11 / azure
    publisherName:
      - "CN=Old Name, O=Old Company Inc, C=US"
      - "CN=New Name, O=New Company Ltd, C=GB"
```

Installs that take this release accept updates signed by either certificate. Because `publisherName` is now explicit, keep the entries in sync with reality; electron-builder validates the list at build time (see below).

**2. Wait for adoption**, then **switch the signing certificate** (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`, the HSM/PKCS#11 token, or the Azure account). Keep both names in `publisherName` for as long as you still want installs on the bridge release to keep updating, and until you are sure no pre-bridge installs matter.

**3. Remove the old name** once the transition is complete.

### Build-time validation

When `publisherName` is configured explicitly and electron-builder can read the signing certificate (a `.pfx`/`.p12` file, a Windows certificate-store entry, or an `.crt`/`.cer` file with a CN), it fails the build with `InvalidConfigurationError` if **none** of the configured names matches the certificate's subject. This catches a wrong `WIN_CSC_LINK` before it produces installers that every install would reject. An array containing both old and new names passes as long as one of them matches the certificate actually in use, so the bridge configuration above never trips it. The check is skipped for custom `sign` hooks and for Azure Trusted Signing (no local certificate to compare against). Setting `publisherName: null` opts out of embedding entirely.

### Notes per signing method

- **signtool (file / store)** — rotate by pointing `certificateFile`/`WIN_CSC_LINK` (or `certificateSubjectName`/`certificateSha1`) at the new certificate. Timestamp your signatures (`rfc3161TimeStampServer`, on by default) so installers signed with the old certificate stay valid after it expires.
- **HSM / PKCS#11** — the certificate lives on the token; rotation means a new token or key label plus, for PKCS#11 without an extractable certificate, an explicit `publisherName`.
- **Azure Trusted Signing** — there is no local certificate, so `publisherName` is required and is embedded verbatim. Confirm the Subject Azure signs with before the bridge release.
- **Custom `verifyUpdateCodeSignature` function** — if your app replaces the verifier (see the [Windows target docs](../win.md)), the rules above are yours to reimplement.
- **Squirrel.Windows** is not supported by electron-updater's auto-update flow, so nothing here applies to it.

See [Windows Code Signing](./code-signing/code-signing-win.md) for configuration details of each method.

## macOS: certificate and Team ID

On macOS, electron-updater downloads the `zip` artifact and hands it to the native **Squirrel.Mac** framework, which verifies that the update's code signature matches the running app's before it is installed. That requirement — the update must be signed by the same Apple Team ID as the installed app — is enforced by Squirrel.Mac and macOS, not by electron-builder or electron-updater, and there is no publisher-name list to widen.

- **Renewing or replacing a Developer ID Application certificate within the same Team** is transparent: the Team ID does not change, so Squirrel.Mac accepts the new signature. Update `CSC_LINK`/`CSC_KEY_PASSWORD` (or the keychain identity selected via `CSC_NAME`/`mac.sign.identity`) and keep shipping.
- **Changing Team ID** (moving the app to a different Apple developer account) cannot be bridged through the updater: installs signed by the old team will not accept an update signed by the new one. Users must download and install the new build manually. Announce it in-app in the last release under the old team.
- **Notarization** is per build and does not create a trust anchor in the installed app. Rotate notarization credentials (`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`, App Store Connect API key) whenever you like.
- The Ed25519 **manifest signature** applies to `latest-mac.yml` exactly as on other platforms, and rotates as described [above](#rotating-the-update-manifest-signing-key-ed25519).

See [macOS Code Signing](./code-signing/code-signing-mac.md) and [Notarization](./code-signing/notarization.md).

## Linux: repository GPG keys

electron-builder does **not** sign `.deb`, `.rpm`, or `AppImage` artifacts itself. What exists:

- **Manifest signature.** The Ed25519 signature on `latest-linux.yml` is the integrity layer electron-builder provides for every Linux target, and it rotates as described [above](#rotating-the-update-manifest-signing-key-ed25519). The downloaded file's `sha512` is checked against that manifest like on every other platform.
- **AppImage.** electron-updater performs no package-level signature check on AppImages beyond the manifest and its `sha512`.
- **deb / rpm.** `AppUpdater.allowUnverifiedLinuxPackages` (default `true`) controls whether the package manager's own signature checks are bypassed when a downloaded package is installed. With `false`, `apt`, `dnf`/`yum`, and `zypper` enforce their normal verification; plain `dpkg` performs no signature verification at all, and a bare `rpm` install cannot be made to enforce it from the command line, so the updater logs a warning in those cases.

If you sign your packages with GPG and enforce it (`allowUnverifiedLinuxPackages = false`), the trust anchor is the public key in the user's keyring (`/etc/apt/trusted.gpg.d`, `/etc/pki/rpm-gpg`, ...). That keyring is populated by your packaging, not by electron-builder, so rotation follows the standard distribution playbook:

1. **Publish the new public key** in your repository metadata and on your download site.
2. **Ship a bridge release** signed with the **old** GPG key whose package installs the **new** public key into the keyring (via a post-install script or a keyring package dependency). Users who install it now trust both keys.
3. **Switch package signing to the new key** after adoption; installs that skipped the bridge will hit a package-manager signature error and need a manual key import or reinstall.
4. Remove the old public key from the keyring in a later release.

## Rotation checklist

Use this as a template for a rotation ticket.

**Before**

- [ ] Generate the new key/certificate on a trusted machine; store it as a *new* secret — do not overwrite the old one yet.
- [ ] Decide how you will measure adoption of the bridge release and how long the window lasts.
- [ ] Decide what happens to installs that never take the bridge (reinstall, legacy feed).

**Bridge release** (verified with the old key, carries the new anchor)

- [ ] Ed25519: `updateManifest.publicKey` = new public key; sign with the old private key.
- [ ] Windows: `win.sign.publisherName` = `[old subject, new subject]`; sign with the old certificate.
- [ ] Linux GPG (if enforced): package installs the new public key; sign with the old GPG key.
- [ ] macOS: nothing to bridge for a same-Team certificate change; announce a Team ID change in-app.
- [ ] Verify the built `app-update.yml` contains the new `updateManifestPublicKey` / both `publisherName` entries before publishing.

**Switch**

- [ ] Point CI at the new private key / certificate.
- [ ] Ed25519: drop the explicit `publicKey` (or set it to the new key).
- [ ] Windows: keep both names until the window closes.
- [ ] Confirm an install on the bridge release updates successfully from the first release signed with the new key.

**After**

- [ ] Remove the old subject from `publisherName`, the old GPG key from the keyring.
- [ ] Delete the old private key / certificate from CI; keep public halves for audit.
- [ ] Record the rotation date and the last version signed with the old key.

## Related

- [Signed Update Manifests](./signed-update-manifests.md) — the Ed25519 manifest signing feature
- [Auto Update](./auto-update.md) — updater behavior and options, including `allowUnverifiedLinuxPackages`
- [Security & Hardening](./security.md) — overview of update security controls
- [Code Signing](./code-signing/code-signing.md) — certificates and environment variables per platform
