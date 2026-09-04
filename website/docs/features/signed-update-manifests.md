---
title: "Signed Update Manifests"
---

# Signed Update Manifests

electron-updater always verifies the sha512 checksum of a downloaded artifact against the update manifest (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`). That protects the *artifact*, but the *manifest itself* is only protected by the transport (HTTPS) and the storage it is served from — anyone who can modify the file on your update server can point clients at an arbitrary payload with a matching checksum.

Signed update manifests close that gap: electron-builder can sign each `latest*.yml` with an **Ed25519** private key at publish time, and electron-updater verifies the signature — before anything is downloaded — against a public key baked into the app at build time. Signing uses Node's built-in `crypto`; no additional dependencies or external tools are involved.

The feature is **opt-in** and backward compatible in both directions:

- Apps built without a public key ignore the `signature` field in the manifest (a one-time warning notes that verification is disabled).
- Apps built with a public key **fail closed**: an unsigned or tampered manifest aborts the update check before any download starts.

## Quick setup

**1. Generate a keypair** (once per app or release channel):

```sh
npx electron-builder create-update-key
```

This writes `update-private-key.pem` (mode `0600`) to the current directory (use `--out <path>` to choose the location) and prints the matching public key for reference. Store the private key as a CI secret — it never needs to be committed anywhere.

**2. Provide the private key at build/publish time**, preferably via an environment variable in CI:

```sh
# either the PEM content itself…
ELECTRON_BUILDER_UPDATE_SIGN_KEY="$(cat update-private-key.pem)" electron-builder --publish always
# …or a path to the key file
ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=/run/secrets/update-private-key.pem electron-builder --publish always
```

No configuration block is required for the environment-variable route: when a key is present, every generated `latest*.yml` gains a base64 `signature` field, and the derived public key is embedded into the app's `app-update.yml` as `updateManifestPublicKey` automatically.

**3. That's it.** electron-updater picks the public key up from `app-update.yml` and enforces verification from the first update check.

## Configuration reference

Instead of (or in addition to) the environment variables, you can configure signing in the [build configuration](../configuration.md) — at the top level, or per platform (e.g. under `linux` or `win`) to sign only some platforms' manifests:

```yaml
updateManifest:
  # Ed25519 private key, PEM (PKCS#8). Secret — prefer ELECTRON_BUILDER_UPDATE_SIGN_KEY in CI.
  signingKey: null
  # Path to a file containing the private key. Alternative to signingKey.
  signingKeyFile: null
  # Public key (PEM or base64 SPKI) embedded into app-update.yml.
  # Optional — derived automatically from the private key when omitted.
  publicKey: null
```

Key resolution order is the same for signing and for embedding the public key: `signingKey` → `signingKeyFile` → `ELECTRON_BUILDER_UPDATE_SIGN_KEY` → `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`. An explicit `publicKey` takes precedence over derivation — useful if the private key is held by an HSM/KMS-style signer and only the public half is available to the build.

At runtime you can also set the key on the updater directly; it overrides the value from `app-update.yml`:

```ts
import { autoUpdater } from "electron-updater"
autoUpdater.updateManifestPublicKey = "-----BEGIN PUBLIC KEY-----\n…"
```

## What is signed

The signature covers the integrity-critical fields of the manifest: `version`, `stagingPercentage`, and every file entry's `url`, `sha512`, and `size` (in a canonical, order-independent form). Cosmetic fields such as `releaseDate` and release notes are not covered, so editing release notes after publishing does not invalidate the signature.

## Verification behavior in electron-updater

When a public key is configured (embedded or set at runtime), verification is enforced on every update check, for every provider:

| Manifest state | Result |
| --- | --- |
| Signed, signature valid | Update proceeds |
| Not signed | Error `ERR_UPDATER_MANIFEST_NOT_SIGNED` |
| Signed, but tampered or signed with a different key | Error `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` |

Both errors are emitted through the updater's regular `error` event and abort the update **before any download begins**.

:::warning[Roll out the key before enforcing it]
Verification is enforced by the *installed* app. Ship at least one release that embeds the public key while your manifests are already being signed; older installs without the key simply skip verification. Conversely, once clients with the key are in the field, every future manifest must be signed — publishing an unsigned manifest would make those clients refuse the update.
:::

## Key rotation

The public key an install trusts is fixed at build time: `updateManifestPublicKey` in `app-update.yml` is a single value, electron-updater never fetches a replacement from the update server, and there is no list of accepted keys. Simply switching the private key would therefore make every existing install reject your manifests with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`. Rotation instead relies on the fact that the embedded public key can be set independently of the signing key (`updateManifest.publicKey` takes precedence over derivation), which lets you ship a **bridge release** that is still verified with the old key but teaches installs to trust the new one:

1. **Bridge release:** keep signing with the **old** private key (for example via `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`) and set `updateManifest.publicKey` to the **new** public key, so this release's `app-update.yml` embeds the new key.
2. **Wait** until the bridge release has reached the installs you care about, continuing to publish with the old key and the new `publicKey` in the meantime.
3. **Switch** the environment to the new private key and remove the explicit `publicKey`. Installs that took the bridge release verify the new signatures; installs that never did stop updating and must be reinstalled or served from a separate feed still signed with the old key.

Keep the old private key only for as long as you still sign a feed with it, then delete it from CI. The full procedure — including compromise handling, key storage advice, and the equivalent steps for Windows, macOS, and Linux code-signing keys — is in the [Key Rotation](./key-rotation.md) runbook.

## Related: Linux package signature enforcement

Manifest signing protects the update *metadata*. Separately, `AppUpdater.allowUnverifiedLinuxPackages` (default `true`) controls whether the OS package manager's own GPG/signature checks are bypassed when installing `.deb` / `.rpm` auto-updates. If you sign your Linux packages, set it to `false` to enforce them — see [Auto Update](./auto-update.md#allowunverifiedlinuxpackages-new) and [Security & Hardening](./security.md#update-security-electron-updater).
