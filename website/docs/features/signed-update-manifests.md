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
auto-update manifests must be signed when publishing, but no Ed25519 signing key was found for mac. Generate
one with `electron-builder create-update-key`, then supply it via the ELECTRON_BUILDER_UPDATE_SIGN_KEY (base64-encoded
PEM file) or ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path) environment variable, or via updateManifest.signingKey /
updateManifest.signingKeyFile in the build configuration. To publish unsigned manifests anyway, opt out
explicitly with `updateManifest: false`. See https://www.electron.build/docs/migration/v27-build-changes#signed-update-manifests-are-required
```

A build **without** a publish policy only warns, so local builds keep working while your release pipeline is the thing that has to hold the key. With [`forceCodeSigning`](./code-signing/code-signing.md#the-forcecodesigning-option), every build that emits a manifest requires the key, whether or not it publishes — pull-request builds included.

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

An explicit `publicKey` takes precedence over derivation and is embedded as-is. Use it to trust keys you do not (yet) sign with — for example the *next* key ahead of a rotation. It must also list at least one of the keys the build signs with: otherwise installs of that release reject manifests signed with the current key(s), and every later release has to be signed by a listed key. A publishing (or `forceCodeSigning`) build in that state fails at build start with an `InvalidConfigurationError` naming the key ids on both sides (any other build only warns). For a deliberate cutover release — signed with the old key, which the installs in the field trust, but embedding only the new one — set `allowSigningKeyOutsideTrustList: true`; the build then publishes and logs a warning. When `publicKey` is not set the trust list is derived from the signing keys, so this check does not apply.

A `publicKey` on its own does **not** satisfy the signing requirement — electron-builder still has no key to sign with, so a publishing build fails. An HSM/KMS-style signer that signs `latest*.yml` in a later step of its own therefore either builds without a publish policy (and without `forceCodeSigning`), where the requirement only warns and the unsigned manifest is written locally for it to sign, or keeps publishing with `publishAutoUpdate: false` on every publish provider — electron-builder then uploads the artifacts and embeds the `publicKey`, but writes no `latest*.yml`, so the external step has to generate the manifest too. See [Key storage](./key-rotation.md#key-storage).

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

The requirement is also waived, without any configuration, where no manifest is emitted at all: a build whose publish providers all set `publishAutoUpdate: false`, a build whose targets write no update info (for example only snap, flatpak, MSI/MSIX, portable, mas/pkg or plain archives), and any build without a publish policy or `forceCodeSigning` (which only warns).

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

Both fields are always written, even with a single key, so the manifest shape does not change when a second key is added. Every key signs both payload formats: electron-updater 7.0.0-alpha.14 and later verify the `EBUM2` entries, while 7.0.0-alpha.8 to alpha.13, which predate `format`, ignore the tag, fail on the `EBUM2` entries and verify the `EBUM1` entry of the same key. The `keyId` lets an updater holding several trusted keys pick the matching signature directly, and lets you tell at a glance which keys signed a release. An entry without `format` is an `EBUM1` signature, as electron-builder 27.0.0-alpha.9 to alpha.14 wrote them.

Before writing the file, electron-builder parses the YAML back the way electron-updater does and checks that both payloads come out exactly as signed, so a build cannot publish a manifest its own installs would refuse.

Before any manifest is written, each one is read back the way electron-updater parses it and verified with every signing key, so a manifest that would not verify is never written or uploaded. To check a finished build — for example after an external step signed its manifests — run [`electron-builder verify`](../cli.md#verify): it verifies every manifest against the trust list each packaged app embeds, and every file it lists against the artifacts.

## What is signed

### EBUM2: every field

An `EBUM2` signature covers **every top-level field except `signature`, `signatures`, `releaseName` and `releaseNotes`**, and everything below those fields in full. A field added to `latest*.yml` later — by a newer electron-builder, or by you — is therefore signed as soon as the build that writes it signs the manifest, without any change to the updater, and adding, changing or removing any covered field invalidates the signature. That includes the fields `EBUM1` leaves unsigned: `releaseDate`, `vendor`, `files[].blockMapSize` and `files[].isAdminRightsRequired`.

`releaseNotes` stays editable after publishing. `releaseName` is not signed because the GitHub and GitLab providers fill it in from the release when the manifest has none, so the updater could not tell a signed name from one it added itself.

The signed bytes are the tag `EBUM2`, a newline and the manifest as canonical JSON (the [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) serialization): object keys sorted at every depth, arrays in their original order, no whitespace, strings and numbers exactly as `JSON.stringify` writes them. electron-builder signs the manifest as js-yaml parses it back from the YAML it writes, and electron-updater canonicalizes the manifest as js-yaml parses it from the server, before the provider adds anything of its own (a GitHub `tag`, `assets`, a release name from the feed). Values whose parsed form is not guaranteed to be the same on both sides are refused rather than converted: a `Date` (an unquoted YAML timestamp — electron-builder writes `releaseDate` quoted, so it stays a string), binary data, `NaN`/infinity, negative zero, YAML anchors and aliases, and nesting deeper than 32 levels. A build whose manifest contains such a value — for example a `Date` in `releaseInfo.vendor` — fails with the path of the value; if you edit `latest*.yml` by hand, keep quoted strings quoted.

To produce an `EBUM2` signature outside electron-builder, parse the final `latest*.yml` with js-yaml and sign the `payload` of `canonicalizeForSigningV2(parsed)` from `builder-util-runtime`, then append `{ keyId, signature, format: EBUM2 }` to `signatures`; the [re-signing script](#re-signing-without-electron-builder) below does this.

### EBUM1: the integrity-critical fields

Every `EBUM1` signature covers the integrity-critical fields of the manifest: `version`, `stagingPercentage`, `minimumSystemVersion` (its absence is signed too, so an OS-version gate cannot be added or removed after signing), `allowCatalogSignature` when it is `true` (written for `win.allowCatalogSignature`; a manifest without it, or with `false`, is signed exactly as before), every file entry's `url`, `sha512`, and `size` (and its `blockMapUrl` when present), and — for the NSIS web installer — every `packages` entry's `path`, `sha512`, `size`, `blockMapSize`, and `isAdminRightsRequired` (all in a canonical, order-independent form). Cosmetic fields — `releaseName`, `releaseNotes`, and `releaseDate` — are not covered, so they remain editable after publishing without invalidating the signature. A covered field is not: setting or changing `stagingPercentage` for a [staged rollout](./auto-update.md#staged-rollouts), for example, means signing the manifest again. To change a covered field after publishing, edit the file and [re-sign it](#re-signing-a-published-manifest). The `signature`/`signatures` fields themselves (including `keyId`) are not part of the signed payload, so signatures can be added or removed without invalidating the others.

`files[].isAdminRightsRequired` is intentionally not signed either. It only decides how electron-updater launches the already hash-verified installer (directly, or through `elevate.exe`), so tampering with it cannot change what gets installed — at worst it causes an unexpected UAC prompt — while leaving it unsigned lets you correct a misconfigured value in `latest.yml` after publishing without re-signing.

The canonical form is injective: every string value is JSON-quoted (so a value can never contain an unescaped newline or tab and cannot impersonate another record), numbers are written bare, and an absent optional field is encoded differently from an empty one. Two manifests therefore produce the same signed bytes only if every covered field is identical.

An `EBUM1` signature cannot vouch for a field it does not cover, so electron-updater accepts one only for a manifest whose top-level fields are all ones an `EBUM1`-only electron-builder writes: `version`, `files`, `path`, `sha512`, `sha2`, `packages`, `isAdminRightsRequired`, `releaseName`, `releaseNotes`, `releaseDate`, `stagingPercentage`, `minimumSystemVersion`, `allowCatalogSignature`, `vendor`, `signature` and `signatures`. Any other top-level field needs a valid `EBUM2` signature, so a field added after `EBUM2` cannot be slipped in by stripping the `EBUM2` signatures from a manifest. While installs still accept `EBUM1`, such a field can be *removed* along with the `EBUM2` signatures, though, so a new field must default to the safe behavior when it is absent.

A signed manifest must also have the shape the signature is meant to protect. Before trying any key, the updater rejects a manifest whose `files` list is empty or missing, whose `version`, `files[].url`/`sha512`, `minimumSystemVersion` or `packages` entries are not plain strings/numbers, whose `allowCatalogSignature` is not a boolean, or whose signed string fields contain control characters, with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` naming the problem. In particular, the deprecated top-level `path`/`sha512` fields (an unsigned mirror of `files[0]`) are never used to download a verified update. electron-builder applies the same checks when signing, so a build cannot produce a signed manifest that its updaters would refuse.

## Re-signing a published manifest {#re-signing-a-published-manifest}

Cosmetic fields can be edited in a published `latest*.yml` as they are, but changing a signed field — raising `stagingPercentage` during a staged rollout, adding a `minimumSystemVersion`, pointing a file `url` at a different host — invalidates its signatures, and every install that embeds a public key then refuses the update with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`. Rather than rebuilding, edit the file and sign it again from the project directory. Like `electron-builder publish`, the command reads the project's electron-builder configuration (`-c` / `--config` picks a different file), and it takes the key(s) from the same place the build does: `updateManifest.signingKey` / `updateManifest.signingKeyFile` (the platform's own `mac.updateManifest` / `win.updateManifest` / `linux.updateManifest` first), then `ELECTRON_BUILDER_UPDATE_SIGN_KEY` / `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`. There is no flag that takes key material.

```sh
# keys from the configuration or the environment, exactly as in a build
npx electron-builder sign-update-manifest dist/latest.yml dist/latest-mac.yml dist/latest-linux.yml

# a different config file, or an inline override of a single setting (relative key files resolve against the project directory)
npx electron-builder sign-update-manifest latest.yml -c electron-builder.release.yml
npx electron-builder sign-update-manifest latest.yml -c.updateManifest.signingKeyFile=keys/update-key.pem
```

The platform of each manifest follows from its name, as the build writes it: `<channel>-mac.yml` is macOS, `<channel>-linux.yml` and `<channel>-linux-<arch>.yml` are Linux, and `<channel>.yml` is Windows. Each file is parsed the way electron-updater parses it, its existing `signature`/`signatures` fields are dropped, and it is checked against the same shape rules the updater applies (a manifest the updater would reject is never signed). Like a publishing build, it refuses signing keys of which none is in an explicit `updateManifest.publicKey`, unless `updateManifest.allowSigningKeyOutsideTrustList` marks a cutover release (without a `publicKey`, the trust list is derived from the signing keys, so there is nothing to refuse). It is then signed by every configured key, as in a build — an `EBUM1` entry per key, then an `EBUM2` entry per key (several keys dual-sign) — and written back in place in the format a build writes: every other field keeps its value and position, and `signature` plus `signatures` come last. Re-signing a manifest of an `EBUM1`-only release (electron-builder 27.0.0-alpha.9 to alpha.14) this way upgrades it to both formats. YAML comments are not preserved. A manifest that is not a regular file is refused, a symlink included: it would overwrite the link's target. When several files are given, all of them are signed before any is written, so one invalid manifest leaves every file untouched. Without a key, or with `updateManifest: false`, the command fails with an error naming the key sources; errors name the configuration field or environment variable a key came from, and key material itself is never printed.

To check an edited file without writing anything, pass `--verify`. It runs the same manifest check as [`electron-builder verify`](../cli.md#verify), with the trust list it uses when no packaged app is at hand: the public keys in `updateManifest.publicKey` (the platform's own block first). Like `verify`, it uses public keys only and never loads a signing key, so it fails with an error naming `updateManifest.publicKey` when that is not set, also when the build derives its trust list from the signing keys. A manifest that `updateManifest: false` opts out of is skipped, and so is one that no trusted key validates when `updateManifest.allowSigningKeyOutsideTrustList` marks a cutover release — unless the trust list was given on the command line, which is always checked exactly as given: every `-c.<platform>.updateManifest.publicKey=...` for that platform's manifests, otherwise every `-c.updateManifest.publicKey=...` (also when the configuration has a platform block), never merged with the configured keys; any other manifest that is unsigned or not signed by a trusted key makes the command exit non-zero, naming the file:

```sh
npx electron-builder sign-update-manifest latest.yml --verify
npx electron-builder sign-update-manifest latest.yml --verify "-c.updateManifest.publicKey=$(cat update-public-key.pem)"
```

`sign-update-manifest --verify` is the per-file check after an edit; [`electron-builder verify`](../cli.md#verify) is the whole-output check of a build, which also checks each manifest against the trust list the packaged apps embed and every file it lists against the artifacts.

Upload the re-signed file to the update feed afterwards; the command does not publish.

### After a file changed {#re-signing-after-a-file-changed}

The signature covers each listed file's `sha512` and `size`, and electron-updater checks a download against both: a full download stops once it receives more bytes than the declared size, and a file whose `sha512` differs is rejected. A release step that changes an artifact after the build — signing a Linux package with its distribution's tools, or signing a Windows installer again — therefore needs a manifest that describes the changed file, signed again. `sign-update-manifest` checks every listed file it finds and refuses to sign a manifest whose `sha512` or `size` does not match the file. It looks for them as [`electron-builder verify`](../cli.md#verify) does: next to the manifest, then — for a manifest inside the build output folder (`directories.output`, `dist` by default) — in its target folder and the output folder itself, where a further publish provider's `dist/<provider>/latest.yml` finds its artifacts. A file is found by the file name in its `url`, or by the GitHub-safe form of a local name (spaces replaced by `-`: a GitHub manifest lists `My App Setup 1.0.0.exe` as `My-App-Setup-1.0.0.exe`), regular files only, never through a symlink. A file found by its name is checked as it is: an unchanged copy of the original artifact elsewhere in those folders does not stand in for it. A listed file that is not found at all is refused when the folders hold other files of the release (another listed file, or a file with the same extension), since it cannot be checked — a GitHub manifest can list a name the build generated for a `productName` with characters GitHub does not allow, and the local file then has to be given that listed name, the name it is uploaded under. When they hold none of them, as when an edit such as `stagingPercentage` is signed away from the build output, the manifest is signed with a warning that the files were not checked. Pass `--rehash` to take the `sha512` and `size` of every `files` entry from the file instead; every listed file then has to be found. Then check the whole output:

```sh
npx electron-builder sign-update-manifest dist/latest-linux.yml --rehash
npx electron-builder verify dist
```

`--rehash` also updates the deprecated top-level `sha512` (and Windows `sha2`) that the build writes for old electron-updater versions. It does not write block maps: a file with a `.blockmap` next to it is downloaded in full by installs updating to this release until the block map is generated from the changed file (a warning names it). An nsis-web `packages` entry declares the size of the block map embedded in its package, which is not recomputed, so a package that changed after the build has to be rebuilt.

### Without electron-builder {#re-signing-without-electron-builder}

A release step that has no electron-builder project at hand can do the same with a short Node.js script, using the latest `builder-util-runtime` and `js-yaml`. Like the build, it writes an `EBUM1` and an `EBUM2` signature for each key; updaters that predate `EBUM2` verify the `EBUM1` one. It takes the `sha512` and `size` of every listed file from the file next to the manifest, checks the manifest the way the updater does, and signs it with the key file(s) named in `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`, the variable the build reads; it never looks for a key anywhere else. Make any other edit, such as `stagingPercentage`, in the file before running it:

```js
// resign-update-manifest.mjs — usage: ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=update-private-key.pem node resign-update-manifest.mjs dist/latest.yml
import { createHash, createPrivateKey, sign } from "node:crypto"
import { createReadStream, lstatSync, readFileSync, writeFileSync } from "node:fs"
import { basename, delimiter, dirname, join } from "node:path"
import { canonicalizeForSigning, canonicalizeForSigningV2, createManifestSignatureEntry, validateSignedManifestShape } from "builder-util-runtime"
import { dump, load } from "js-yaml"

// every key the release was signed with, in the same order: PEM files separated by ":" (";" on Windows), one key per file
const keyFiles = (process.env.ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE ?? "").split(delimiter).map(it => it.trim()).filter(it => it.length > 0)
const [file] = process.argv.slice(2)
if (file == null || keyFiles.length === 0) {
  throw new Error("usage: ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE=update-private-key.pem node resign-update-manifest.mjs dist/latest.yml")
}

async function digest(path, algorithm, encoding) {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest(encoding)
}

const info = load(readFileSync(file, "utf8"))
delete info.signature
delete info.signatures
// every listed file, from the file of the same name next to the manifest (never through a symlink)
for (const entry of info.files ?? []) {
  const local = join(dirname(file), basename(String(entry.url).split(/[?#]/)[0]))
  const stats = lstatSync(local)
  if (!stats.isFile()) {
    throw new Error(`${local} is not a regular file`)
  }
  entry.sha512 = await digest(local, "sha512", "base64")
  entry.size = stats.size
  // the deprecated top-level descriptor, when the build wrote one for this file
  if (info.path === entry.url && info.sha512 != null) {
    info.sha512 = entry.sha512
    if (info.sha2 != null) {
      info.sha2 = await digest(local, "sha256", "hex")
    }
  }
}
const problem = validateSignedManifestShape(info)
if (problem != null) {
  throw new Error(`${file} cannot be signed: ${problem}`)
}

const ebum2 = canonicalizeForSigningV2(info)
if (!ebum2.ok) {
  throw new Error(`${file} cannot be signed: ${ebum2.reason}`)
}
const keys = keyFiles.map(keyFile => createPrivateKey(readFileSync(keyFile)))
// an EBUM1 entry per key, then an EBUM2 entry per key, as electron-builder writes them
const payloads = [["EBUM1", canonicalizeForSigning(info)], ["EBUM2", ebum2.payload]]
const signatures = payloads.flatMap(([format, payload]) =>
  keys.map(key => createManifestSignatureEntry(key, sign(null, Buffer.from(payload, "utf8"), key).toString("base64"), format))
)
info.signature = signatures[0].signature
info.signatures = signatures
writeFileSync(file, dump(info, { lineWidth: -1, noRefs: true }))
```

Before uploading, run [`electron-builder verify`](../cli.md#verify) on the output from the project directory (`npx electron-builder verify dist`): it checks the new signature against the trust list and the `sha512` and `size` of every listed file against the artifacts. The script leaves nsis-web `packages` entries and block maps as they are, as `--rehash` does.

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

Some settings take effect only in a manifest that was verified this way. `allowCatalogSignature: true` (written for [`win.allowCatalogSignature`](../win.md)) lets the NSIS updater accept an installer whose signature Windows reports from a security catalog, when the catalog signer matches `publisherName`; without a trusted key, or for a manifest that was not verified, it is ignored with a warning. Since it is signed, changing it later means re-signing or republishing `latest.yml`. electron-updater 7.0.0-alpha.8 to alpha.11 installs with an update key configured reject a signed manifest that sets `allowCatalogSignature: true` (`ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`), the same way alpha.8 treats a signed `files[].blockMapUrl`.

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

On Linux, the manifest signature is what makes an update authentic. electron-updater checks the downloaded file against the manifest's `sha512`, and no package-level signature check backs that up by default: an AppImage has none, and a `.deb` has none whatever `allowUnverifiedLinuxPackages` is set to, because `apt` verifies no signature on a local `.deb` file. Only for `.rpm` updates does `AppUpdater.allowUnverifiedLinuxPackages` (default `true`) control the package manager's own signature check: if you sign your rpm packages, set it to `false` to have `dnf`/`yum` and `zypper` enforce it. Don't set `updateManifest: false` for Linux apps. See [Linux update authenticity](./auto-update.md#linux-update-authenticity) and [Security & Hardening](./security.md#update-security-electron-updater).
