---
title: "Signed Update Manifests"
---

# Signed Update Manifests

electron-updater always verifies the sha512 checksum of a downloaded artifact against the update manifest (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`). That protects the *artifact*, but the *manifest itself* is only protected by the transport (HTTPS) and the storage it is served from — anyone who can modify the file on your update server can point clients at an arbitrary payload with a matching checksum.

Signed update manifests close that gap: electron-builder can sign each `latest*.yml` with one or more **Ed25519** private keys at publish time, and electron-updater verifies the signature — before anything is downloaded — against a list of trusted public keys baked into the app at build time. Signing uses Node's built-in `crypto`; no additional dependencies or external tools are involved.

The feature is **opt-in** and backward compatible in both directions:

- Apps built without a public key ignore the `signature`/`signatures` fields in the manifest (a one-time warning notes that verification is disabled).
- Apps built with a public key **fail closed**: an unsigned or tampered manifest aborts the update check before any download starts.

## Quick setup

**1. Generate a keypair** (once per app or release channel):

```sh
npx electron-builder create-update-key
```

This writes `update-private-key.pem` (mode `0600`) to the current directory (use `--out <path>` to choose the location) and prints the matching public key and its **key id** (the hex SHA-256 of the public key's SPKI DER encoding, which appears as `keyId` next to each signature in the manifest) for reference. Store the private key as a CI secret — it never needs to be committed anywhere.

**2. Provide the private key at build/publish time**, preferably via an environment variable in CI:

```sh
# either the PEM content itself…
ELECTRON_BUILDER_UPDATE_SIGN_KEY="$(cat update-private-key.pem)" electron-builder --publish always
# …or a path to the key file
ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=/run/secrets/update-private-key.pem electron-builder --publish always
```

No configuration block is required for the environment-variable route: when a key is present, every generated `latest*.yml` gains a base64 `signature` field plus a `signatures` list (see [What is written](#what-is-written)), and the derived public key is embedded into the app's `app-update.yml` as `updateManifestPublicKey` automatically.

**3. That's it.** electron-updater picks the public key up from `app-update.yml` and enforces verification from the first update check.

## Configuration reference

Instead of (or in addition to) the environment variables, you can configure signing in the [build configuration](../configuration.md) — at the top level, or per platform (e.g. under `linux` or `win`) to sign only some platforms' manifests:

```yaml
updateManifest:
  # Ed25519 private key(s), PEM (PKCS#8). Secret — prefer ELECTRON_BUILDER_UPDATE_SIGN_KEY in CI.
  # A string (which may contain several concatenated PEM blocks) or an array of strings.
  signingKey: null
  # Path(s) to file(s) containing private key(s). Alternative to signingKey. String or array.
  # Relative paths resolve against the project directory.
  signingKeyFile: null
  # Public key(s) (PEM or base64 SPKI) embedded into app-update.yml as the updater's trust list.
  # Optional — derived automatically from the private key(s) when omitted. String or array.
  publicKey: null
```

Key resolution order is: `signingKey` → `signingKeyFile` → `ELECTRON_BUILDER_UPDATE_SIGN_KEY` → `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`. The first source that is set wins, but that source may provide **several keys**:

| Source | Several keys |
| --- | --- |
| `signingKey` / `ELECTRON_BUILDER_UPDATE_SIGN_KEY` | concatenate the PEM blocks (`cat a.pem b.pem`), or use an array in config |
| `signingKeyFile` | an array of paths in config |
| `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` | join the paths with the OS path delimiter: `a.pem:b.pem` on Linux/macOS, `a.pem;b.pem` on Windows |

A relative `signingKeyFile` path resolves against the project directory (where the build configuration lives), like every other path in the configuration; a relative `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` resolves against the current working directory, as environment-variable paths usually do.

Every key must be a distinct Ed25519 key; duplicates and other key types fail the build. When several keys are configured, **each manifest is signed by all of them** and the trust list embeds all of their public keys — this is the dual-signing used during [key rotation](#key-rotation).

An explicit `publicKey` takes precedence over derivation and is embedded as-is. Use it to trust keys you do not (yet) sign with — for example the *next* key ahead of a rotation — or when the private key is held by an HSM/KMS-style signer and only the public half is available to the build. If none of the keys the build signs with is in an explicit `publicKey` list, electron-builder logs a warning: installs of that release could not verify its own manifests, which is only ever intended for a deliberate bridge release.

At runtime you can also set the trust list on the updater directly; it overrides the value from `app-update.yml`:

```ts
import { autoUpdater } from "electron-updater"
autoUpdater.updateManifestPublicKey = "-----BEGIN PUBLIC KEY-----\n…" // or an array of keys
```

## What is written

`app-update.yml` gains `updateManifestPublicKey`: a single string when one key is trusted (unchanged from the single-key format), a YAML list when several are.

Each signed `latest*.yml` gains:

```yaml
signature: b0Qk…               # legacy single field: the FIRST signing key's signature
signatures:
  - keyId: 3f9c…e1             # hex SHA-256 of the signing key's public key (SPKI DER), as printed by create-update-key
    signature: b0Qk…           # same value as `signature` above
  - keyId: a71d…04             # one more entry per additional signing key
    signature: Xr2w…
```

Both fields are always written, even with a single key, so the manifest shape does not change when a second key is added. Each entry signs the same payload; the `keyId` lets an updater holding several trusted keys pick the matching signature directly, and lets you tell at a glance which keys signed a release.

## What is signed

Every signature covers the integrity-critical fields of the manifest: `version`, `stagingPercentage`, `minimumSystemVersion` (its absence is signed too, so an OS-version gate cannot be added or removed after signing), every file entry's `url`, `sha512`, and `size`, and — for the NSIS web installer — every `packages` entry's `path`, `sha512`, `size`, `blockMapSize`, and `isAdminRightsRequired` (all in a canonical, order-independent form). Cosmetic fields — `releaseName`, `releaseNotes`, and `releaseDate` — are not covered, so they remain editable after publishing without invalidating the signature. The `signature`/`signatures` fields themselves (including `keyId`) are not part of the signed payload, so signatures can be added or removed without invalidating the others.

The canonical form is injective: every string value is JSON-quoted (so a value can never contain an unescaped newline or tab and cannot impersonate another record), numbers are written bare, and an absent optional field is encoded differently from an empty one. Two manifests therefore produce the same signed bytes only if every covered field is identical.

A signed manifest must also have the shape the signature is meant to protect. Before trying any key, the updater rejects a manifest whose `files` list is empty or missing, whose `version`, `files[].url`/`sha512`, `minimumSystemVersion` or `packages` entries are not plain strings/numbers, or whose signed string fields contain control characters, with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` naming the problem. In particular, the deprecated top-level `path`/`sha512` fields (an unsigned mirror of `files[0]`) are never used to download a verified update. electron-builder applies the same checks when signing, so a build cannot produce a signed manifest that its updaters would refuse.

## Verification behavior in electron-updater

When at least one public key is configured (embedded or set at runtime), verification is enforced on every update check, for every provider. The manifest is accepted when **any trusted key validates any of its signatures** (`signatures` entries tagged with that key's id are tried first, then the untagged legacy `signature`):

| Manifest state | Result |
| --- | --- |
| At least one signature validates against a trusted key | Update proceeds |
| No `signature` and no `signatures` | Error `ERR_UPDATER_MANIFEST_NOT_SIGNED` |
| Signed, but tampered or signed only by keys the install does not trust | Error `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` |

Both errors are emitted through the updater's regular `error` event and abort the update **before any download begins**.

:::warning[Roll out the key before enforcing it]
Verification is enforced by the *installed* app. Ship at least one release that embeds the public key while your manifests are already being signed; older installs without the key simply skip verification. Conversely, once clients with the key are in the field, every future manifest must be signed — publishing an unsigned manifest would make those clients refuse the update.
:::

## Key rotation

An install trusts the **list** of public keys embedded in its `app-update.yml`, and a manifest can carry a signature from **each** of several keys. Rotation therefore needs no flag day:

1. **Bridge release(s):** configure both the **old** and the **new** private key (old first, so it also fills the legacy `signature` field), e.g. `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=old.pem:new.pem`. Manifests are now dual-signed and `app-update.yml` trusts `[old, new]`. Installs in the field verify via the old signature; once updated they trust both keys.
2. **Keep dual-signing** for as long as you want installs that predate the first bridge release to be able to update.
3. **Drop the old key** from the environment. Manifests are signed by the new key only; every install that took a bridge release keeps verifying. Installs that never did stop updating (`ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`) and must be reinstalled or served from a separate feed still signed with the old key.

Better still, embed the *next* key before you need it: set `updateManifest.publicKey` to `[current, next]` and keep the next private key offline. A compromise of the current key can then be answered by switching to the next key at once, with no bridge release. Note that a trust list does not protect against a leaked key itself while installs still list it — remove it from the list as fast as adoption allows. The full procedure — including compromise handling, key storage advice, and the equivalent steps for Windows, macOS, and Linux code-signing keys — is in the [Key Rotation](./key-rotation.md) runbook.

## Related: Linux package signature enforcement

Manifest signing protects the update *metadata*. Separately, electron-updater installs `.deb` / `.rpm` auto-updates with the OS package manager's own GPG/signature checks bypassed, because electron-builder does not sign Linux packages itself. The `sha512` of the downloaded package is still checked against the (signed) manifest. A gate for those bypass flags (`AppUpdater.allowUnverifiedLinuxPackages`) is available in electron-updater v27+ only.
