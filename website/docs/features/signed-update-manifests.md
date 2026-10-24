---
title: "Signed Update Manifests"
---

# Signed Update Manifests

electron-updater always verifies the sha512 checksum of a downloaded artifact against the update manifest (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`). That protects the *artifact*, but the *manifest itself* is only protected by the transport (HTTPS) and the storage it is served from — anyone who can modify the file on your update server can point clients at an arbitrary payload with a matching checksum.

Signed update manifests close that gap: electron-builder can sign each `latest*.yml` with one or more **Ed25519** private keys at publish time, and electron-updater verifies the signature — before anything is downloaded — against a list of trusted public keys baked into the app at build time. Signing uses Node's built-in `crypto`; no additional dependencies or external tools are involved.

Signing is **required**: publishing a build that emits auto-update metadata fails unless a signing key resolves, and `updateManifest: false` is the only way to opt out. See [Opting out](#opting-out).

Verification remains backward compatible in both directions:

- Apps built **before** a public key existed ignore the `signature`/`signatures` fields in the manifest (a one-time warning notes that verification is disabled).
- Apps built **with** a public key **fail closed**: an unsigned or tampered manifest aborts the update check before any download starts.

:::warning[Full protection arrives one release after adoption]
Installs already in the field carry whatever `app-update.yml` they shipped with. Those built before you adopted signing have no trusted key, so they keep accepting unsigned manifests — signing a release does not retroactively protect the installs that will consume it. The installs protected by a signed manifest are the ones built *after* the public key was embedded.
:::

## Quick setup

**1. Generate a keypair** (once per app or release channel):

```sh
npx electron-builder create-update-key
```

This writes `update-private-key.pem` (mode `0600`) to the current directory (use `--out <path>` to choose the location) and prints the matching public key and its **key id** (the hex SHA-256 of the public key's SPKI DER encoding, which appears as `keyId` next to each signature in the manifest) for reference. Store the private key as a CI secret, base64-encoded (see [Providing the key in CI](#ci-secrets)) — it never needs to be committed anywhere.

**2. Provide the private key at build/publish time**, preferably via an environment variable in CI:

```sh
# either the PEM file, base64-encoded on one line (the value you store as the CI secret)…
ELECTRON_BUILDER_UPDATE_SIGN_KEY="$(base64 < update-private-key.pem | tr -d '\n')" electron-builder --publish always
# …or a path to the key file (PEM, not encoded)
ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=/run/secrets/update-private-key.pem electron-builder --publish always
```

No configuration block is required — the environment-variable route is the whole setup. Every generated `latest*.yml` gains a base64 `signature` field plus a `signatures` list (see [What is written](#what-is-written)), and the derived public key is embedded into the app's `app-update.yml` as `updateManifestPublicKey` automatically.

A publishing build with no resolvable key fails instead — at build start, before anything is packed or uploaded, so none of that build's artifacts are published:

```
auto-update manifests must be signed, but no Ed25519 signing key was found for mac. Generate one with
`electron-builder create-update-key`, then supply it via the ELECTRON_BUILDER_UPDATE_SIGN_KEY (base64-encoded PEM file)
or ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path) environment variable, or via updateManifest.signingKey /
updateManifest.signingKeyFile in the build configuration. To publish unsigned manifests anyway, opt out
explicitly with `updateManifest: false`.
```

A build **without** a publish policy only warns, so local builds keep working while your release pipeline is the thing that has to hold the key.

**3. That's it.** electron-updater picks the public key up from `app-update.yml` and enforces verification from the first update check.

## Providing the key in CI {#ci-secrets}

`ELECTRON_BUILDER_UPDATE_SIGN_KEY` takes the private key file **base64-encoded**, so the secret is a single line of `A-Z`, `a-z`, `0-9`, `+`, `/` and `=`. Masked and hidden CI variables need exactly that — GitLab, for example, refuses to mask a value that spans several lines or contains spaces, and Bitbucket cannot store line breaks at all. Encode the file once and store the output as the secret:

| Platform | Command |
| --- | --- |
| macOS, Linux | `base64 < update-private-key.pem \| tr -d '\n'` |
| Linux (GNU coreutils) | `base64 -w0 update-private-key.pem` |
| Any OS with OpenSSL | `openssl base64 -A -in update-private-key.pem` |
| PowerShell | `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path update-private-key.pem)))` |

To sign with **several keys** (see [Key rotation](#key-rotation)), concatenate the PEM files — old key first — and encode the result **once**. Encoding each file separately and joining the outputs does not work:

```sh
cat update-key.old.pem update-key.new.pem | base64 | tr -d '\n'
```

Then expose the secret to the build — in GitHub Actions, for example:

```yaml
env:
  ELECTRON_BUILDER_UPDATE_SIGN_KEY: ${{ secrets.ELECTRON_BUILDER_UPDATE_SIGN_KEY }}
```

On GitLab, add it under **Settings → CI/CD → Variables** as a variable of type *Variable* with the visibility *Masked and hidden*.

The value is checked before anything is signed, and a value that does not pass fails the build with an error that never prints it:

- a raw PEM — the format of the 27.0.0 alphas up to alpha.11;
- a value that is not standard base64 — surrounding quotes, URL-safe `-`/`_` characters, missing `=` padding, a truncated copy, or separately encoded keys joined together;
- a value that does not decode to complete PEM private keys — only the key body between the `-----BEGIN`/`-----END` lines, a value encoded twice, or a file path.

Line breaks in the value are ignored, so wrapped `base64` output works too, but GitLab will not mask it — hence the `tr -d '\n'`. Do not use `certutil -encode` on Windows, which adds `-----BEGIN CERTIFICATE-----` lines (use the PowerShell command above), and note that GNU `base64` reads `-i` as `--ignore-garbage`, not as the input file.

To keep the key in a file instead — a Docker or Kubernetes secret, or a file your CI mounts — point `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` at the PEM file; files are not base64-encoded.

## Configuration reference

Instead of (or in addition to) the environment variables, you can configure signing in the [build configuration](../configuration.md) — at the top level, or per platform (e.g. under `linux` or `win`) to sign only some platforms' manifests:

```yaml
updateManifest:
  # Ed25519 private key(s), PEM (PKCS#8). Secret — prefer ELECTRON_BUILDER_UPDATE_SIGN_KEY (base64-encoded) in CI.
  # A string (which may contain several concatenated PEM blocks) or an array of strings.
  signingKey: null
  # Path(s) to file(s) containing private key(s). Alternative to signingKey. String or array.
  # Relative paths resolve against the project directory.
  signingKeyFile: null
  # Public key(s) (PEM or base64 SPKI) embedded into app-update.yml as the updater's trust list.
  # Optional — derived automatically from the private key(s) when omitted. String or array.
  # When set, it must include a signing key, or a publishing build fails (see below).
  publicKey: null
  # Lets a publishing build sign only with keys that are not in publicKey: a deliberate cutover
  # release. Only warns then. Ignored when publicKey is not set.
  allowSigningKeyOutsideTrustList: false
```

The whole option may instead be set to `false`, the only opt-out:

```yaml
updateManifest: false # publishes UNSIGNED manifests; warns on every build
```

Key resolution order is: `signingKey` → `signingKeyFile` → `ELECTRON_BUILDER_UPDATE_SIGN_KEY` → `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`. The first source that is set wins, but that source may provide **several keys**:

| Source | Several keys |
| --- | --- |
| `signingKey` | concatenate the PEM blocks (`cat a.pem b.pem`), or use an array in config |
| `ELECTRON_BUILDER_UPDATE_SIGN_KEY` | base64-encode the concatenated PEM files once: `cat a.pem b.pem \| base64 \| tr -d '\n'` (see [Providing the key in CI](#ci-secrets)) |
| `signingKeyFile` | an array of paths in config |
| `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` | join the paths with the OS path delimiter: `a.pem:b.pem` on Linux/macOS, `a.pem;b.pem` on Windows |

A relative `signingKeyFile` path resolves against the project directory (where the build configuration lives), like every other path in the configuration; a relative `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` resolves against the current working directory, as environment-variable paths usually do.

Every key must be a distinct Ed25519 key; duplicates and other key types fail the build. When several keys are configured, **each manifest is signed by all of them** and the trust list embeds all of their public keys — this is the dual-signing used during [key rotation](#key-rotation).

An explicit `publicKey` takes precedence over derivation and is embedded as-is. Use it to trust keys you do not (yet) sign with — for example the *next* key ahead of a rotation. It must also list at least one of the keys the build signs with: otherwise installs of that release reject manifests signed with the current key(s), and every later release has to be signed by a listed key. A publishing build in that state fails at build start with an `InvalidConfigurationError` naming the key ids on both sides (a build without a publish policy only warns). For a deliberate cutover release — signed with the old key, which the installs in the field trust, but embedding only the new one — set `allowSigningKeyOutsideTrustList: true`; the build then publishes and logs a warning. When `publicKey` is not set the trust list is derived from the signing keys, so this check does not apply.

A `publicKey` on its own does **not** satisfy the signing requirement — electron-builder still has no key to sign with, so a publishing build fails. An HSM/KMS-style signer that signs `latest*.yml` in a later step of its own therefore either builds without a publish policy, where the requirement only warns and the unsigned manifest is written locally for it to sign, or keeps publishing with `publishAutoUpdate: false` on every publish provider — electron-builder then uploads the artifacts and embeds the `publicKey`, but writes no `latest*.yml`, so the external step has to generate the manifest too. See [Key storage](./key-rotation.md#key-storage).

At runtime you can also set the trust list on the updater directly; it overrides the value from `app-update.yml`:

```ts
import { autoUpdater } from "electron-updater"
autoUpdater.updateManifestPublicKey = "-----BEGIN PUBLIC KEY-----\n…" // or an array of keys
```

## Opting out

Set `updateManifest: false` — at the top level, or under a platform key — to publish unsigned manifests. This is the only opt-out, and every build that produces a manifest logs a warning naming the consequence.

```yaml
updateManifest: false
```

Two properties are worth knowing:

- **It short-circuits the environment variables.** A leftover `ELECTRON_BUILDER_UPDATE_SIGN_KEY` in CI cannot re-enable signing behind the back of the opt-out, so `false` means unsigned everywhere, deterministically.
- **A platform value wins over the root**, so `linux: { updateManifest: false }` opts out for Linux only while a root signing config still covers the other platforms — and the converse works too. A platform value of `null`, on the other hand, falls back to the root rather than opting out.

The requirement is also waived, without any configuration, where no manifest is emitted at all: a build whose publish providers all set `publishAutoUpdate: false`, a build whose targets write no update info (for example only snap, flatpak, MSI/MSIX, portable, mas/pkg or plain archives), and any build without a publish policy (which only warns).

:::danger[Opting out is not reversible for a release line]
Once a release embeds a public key, its installs are **fail-closed**: an unsigned manifest is rejected with `ERR_UPDATER_MANIFEST_NOT_SIGNED` and those installs stop updating entirely. Do not switch to `updateManifest: false` after shipping signed manifests, and make sure *every* pipeline that can publish a release — including a hotfix built from a laptop — has the key.
:::

Legitimate reasons to opt out: an app that does not auto-update at all. A pipeline that signs `latest*.yml` itself in a later step should **not** opt out — `false` also drops `updateManifest.publicKey`, so installs would embed no trust list and never verify those signatures; see [Key storage](./key-rotation.md#key-storage) for its two routes.

## What is written

`app-update.yml` gains `updateManifestPublicKey`: a single string when one key is trusted (unchanged from the single-key format), a YAML list when several are.

Each signed `latest*.yml` gains:

```yaml
signature: b0Qk…               # legacy single field: the FIRST signing key's EBUM1 signature
signatures:
  - keyId: 3f9c…e1             # hex SHA-256 of the signing key's public key (SPKI DER), as printed by create-update-key
    signature: b0Qk…           # same value as `signature` above
    format: EBUM1              # the payload this entry signs (see What is signed)
  - keyId: a71d…04             # one EBUM1 entry per additional signing key
    signature: Xr2w…
    format: EBUM1
  - keyId: 3f9c…e1             # then one EBUM2 entry per signing key, in the same order
    signature: 9fLp…
    format: EBUM2
  - keyId: a71d…04
    signature: Qm0c…
    format: EBUM2
```

Both fields are always written, even with a single key, so the manifest shape does not change when a second key is added. Every key signs both payload formats: electron-updater 7.0.0-alpha.12 and later verify the `EBUM2` entries, while 7.0.0-alpha.8 to alpha.11, which predate `format`, ignore the tag, fail on the `EBUM2` entries and verify the `EBUM1` entry of the same key. The `keyId` lets an updater holding several trusted keys pick the matching signature directly, and lets you tell at a glance which keys signed a release. An entry without `format` is an `EBUM1` signature, as electron-builder 27.0.0-alpha.9 to alpha.12 wrote them.

Before writing the file, electron-builder parses the YAML back the way electron-updater does and checks that both payloads come out exactly as signed, so a build cannot publish a manifest its own installs would refuse.

## What is signed

### EBUM2: every field

An `EBUM2` signature covers **every top-level field except `signature`, `signatures`, `releaseName` and `releaseNotes`**, and everything below those fields in full. A field added to `latest*.yml` later — by a newer electron-builder, or by you — is therefore signed as soon as the build that writes it signs the manifest, without any change to the updater, and adding, changing or removing any covered field invalidates the signature. That includes the fields `EBUM1` leaves unsigned: `releaseDate`, `vendor`, `files[].blockMapSize` and `files[].isAdminRightsRequired`.

`releaseNotes` stays editable after publishing. `releaseName` is not signed because the GitHub and GitLab providers fill it in from the release when the manifest has none, so the updater could not tell a signed name from one it added itself.

The signed bytes are the tag `EBUM2`, a newline and the manifest as canonical JSON (the [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) serialization): object keys sorted at every depth, arrays in their original order, no whitespace, strings and numbers exactly as `JSON.stringify` writes them. electron-builder signs the manifest as js-yaml parses it back from the YAML it writes, and electron-updater canonicalizes the manifest as js-yaml parses it from the server, before the provider adds anything of its own (a GitHub `tag`, `assets`, a release name from the feed). Values whose parsed form is not guaranteed to be the same on both sides are refused rather than converted: a `Date` (an unquoted YAML timestamp — electron-builder writes `releaseDate` quoted, so it stays a string), binary data, `NaN`/infinity, negative zero, YAML anchors and aliases, and nesting deeper than 32 levels. A build whose manifest contains such a value — for example a `Date` in `releaseInfo.vendor` — fails with the path of the value; if you edit `latest*.yml` by hand, keep quoted strings quoted.

To produce an `EBUM2` signature outside electron-builder, parse the final `latest*.yml` with js-yaml and sign the `payload` of `canonicalizeForSigningV2(parsed)` from `builder-util-runtime`, then append `{ keyId, signature, format: EBUM2 }` to `signatures`.

### EBUM1: the integrity-critical fields

Every `EBUM1` signature covers the integrity-critical fields of the manifest: `version`, `stagingPercentage`, `minimumSystemVersion` (its absence is signed too, so an OS-version gate cannot be added or removed after signing), every file entry's `url`, `sha512`, and `size` (and its `blockMapUrl` when present), and — for the NSIS web installer — every `packages` entry's `path`, `sha512`, `size`, `blockMapSize`, and `isAdminRightsRequired` (all in a canonical, order-independent form). Cosmetic fields — `releaseName`, `releaseNotes`, and `releaseDate` — are not covered, so they remain editable after publishing without invalidating the signature. The `signature`/`signatures` fields themselves (including `keyId`) are not part of the signed payload, so signatures can be added or removed without invalidating the others.

`files[].isAdminRightsRequired` is intentionally not signed either. It only decides how electron-updater launches the already hash-verified installer (directly, or through `elevate.exe`), so tampering with it cannot change what gets installed — at worst it causes an unexpected UAC prompt — while leaving it unsigned lets you correct a misconfigured value in `latest.yml` after publishing without re-signing.

The canonical form is injective: every string value is JSON-quoted (so a value can never contain an unescaped newline or tab and cannot impersonate another record), numbers are written bare, and an absent optional field is encoded differently from an empty one. Two manifests therefore produce the same signed bytes only if every covered field is identical.

An `EBUM1` signature cannot vouch for a field it does not cover, so electron-updater accepts one only for a manifest whose top-level fields are all ones an `EBUM1`-only electron-builder writes: `version`, `files`, `path`, `sha512`, `sha2`, `packages`, `isAdminRightsRequired`, `releaseName`, `releaseNotes`, `releaseDate`, `stagingPercentage`, `minimumSystemVersion`, `vendor`, `signature` and `signatures`. Any other top-level field needs a valid `EBUM2` signature, so a field added after `EBUM2` cannot be slipped in by stripping the `EBUM2` signatures from a manifest. While installs still accept `EBUM1`, such a field can be *removed* along with the `EBUM2` signatures, though, so a new field must default to the safe behavior when it is absent.

A signed manifest must also have the shape the signature is meant to protect. Before trying any key, the updater rejects a manifest whose `files` list is empty or missing, whose `version`, `files[].url`/`sha512`, `minimumSystemVersion` or `packages` entries are not plain strings/numbers, or whose signed string fields contain control characters, with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` naming the problem. In particular, the deprecated top-level `path`/`sha512` fields (an unsigned mirror of `files[0]`) are never used to download a verified update. electron-builder applies the same checks when signing, so a build cannot produce a signed manifest that its updaters would refuse.

## Verification behavior in electron-updater

When at least one public key is configured (embedded or set at runtime), verification is enforced on every update check, for every provider. The manifest is accepted when **any trusted key validates any of its signatures**. `EBUM2` entries are tried first; `EBUM1` entries and the legacy `signature` only after them, and only for a manifest whose fields `EBUM1` can vouch for (see [What is signed](#what-is-signed)). Entries in a format the updater does not know are skipped. Within a format, entries tagged with a trusted key's id are tried before untagged ones. The update log names the format that verified (`Update manifest signature verified for version 1.2.3 (EBUM2)`).

A custom provider that builds the `UpdateInfo` itself is verified on the object it returns, so a field it adds counts against the signature. Parse the manifest with `parseUpdateInfo` from `electron-updater`, and pass a copy you return through `carryUpdateManifestSource(parsed, copy)`, so the updater verifies the manifest as published.

| Manifest state | Result |
| --- | --- |
| At least one signature validates against a trusted key | Update proceeds |
| No `signature` and no `signatures` | Error `ERR_UPDATER_MANIFEST_NOT_SIGNED` |
| Signed, but tampered or signed only by keys the install does not trust | Error `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` |
| Signed with `EBUM1` only, but carries a field `EBUM1` does not vouch for | Error `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`, naming the field |

Both errors are emitted through the updater's regular `error` event and abort the update **before any download begins**.

:::warning[The hazard is turning it off, not turning it on]
Verification is enforced by the *installed* app, and since signing is on by default there is nothing to roll out — your first build already embeds the public key and signs its manifests. Older installs without the key simply skip verification. What matters from then on is that every future manifest is signed: publishing an unsigned one makes every install that carries the key refuse the update.
:::

## Key rotation

An install trusts the **list** of public keys embedded in its `app-update.yml`, and a manifest can carry a signature from **each** of several keys. Rotation therefore needs no flag day:

1. **Bridge release(s):** configure both the **old** and the **new** private key (old first, so it also fills the legacy `signature` field), e.g. `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=old.pem:new.pem`, or `ELECTRON_BUILDER_UPDATE_SIGN_KEY` holding the output of `cat old.pem new.pem | base64 | tr -d '\n'`. Manifests are now dual-signed and `app-update.yml` trusts `[old, new]`. Installs in the field verify via the old signature; once updated they trust both keys.
2. **Keep dual-signing** for as long as you want installs that predate the first bridge release to be able to update.
3. **Drop the old key** from the environment. Manifests are signed by the new key only; every install that took a bridge release keeps verifying. Installs that never did stop updating (`ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`) and must be reinstalled or served from a separate feed still signed with the old key.

Better still, embed the *next* key before you need it: set `updateManifest.publicKey` to `[current, next]` and keep the next private key offline. A compromise of the current key can then be answered by switching to the next key at once, with no bridge release. Note that a trust list does not protect against a leaked key itself while installs still list it — remove it from the list as fast as adoption allows. The full procedure — including compromise handling, key storage advice, and the equivalent steps for Windows, macOS, and Linux code-signing keys — is in the [Key Rotation](./key-rotation.md) runbook.

## Related: Linux package signature enforcement

Manifest signing protects the update *metadata*. Separately, `AppUpdater.allowUnverifiedLinuxPackages` (default `true`) controls whether the OS package manager's own GPG/signature checks are bypassed when installing `.deb` / `.rpm` auto-updates. If you sign your Linux packages, set it to `false` to enforce them — see [Auto Update](./auto-update.md#allowunverifiedlinuxpackages-new) and [Security & Hardening](./security.md#update-security-electron-updater).
