# Migration Plan: Remove `app-builder-bin` Binary

## Context

`app-builder-bin` (https://github.com/develar/app-builder) is a precompiled Go binary shipped as an npm package (`app-builder-bin@5.0.0-alpha.12`). It is the only dependency of `packages/builder-util/` that requires a platform-specific native binary. Removing it eliminates a maintenance burden (binary distribution, architecture gaps), simplifies cross-compilation, and removes a single-maintainer upstream risk.

The binary is invoked via `executeAppBuilder()` in `packages/builder-util/src/util.ts`, which spawns it as a child process. Two thin wrappers in `packages/app-builder-lib/src/util/appBuilder.ts` handle JSON I/O:

- `executeAppBuilderAsJson<T>(args)` — spawns binary, parses stdout as JSON
- `executeAppBuilderAndWriteJson(args, data, opts)` — spawns binary, writes `JSON.stringify(data)` to stdin, returns stdout string

---

## Complete Inventory of app-builder Commands

### Commands called in the codebase

| Command | Source File | Wrapper Used | Call Count |
|---|---|---|---|
| `ksuid` | `packages/app-builder-lib/src/targets/nsis/NsisTarget.ts:309` | `executeAppBuilder` (raw) | 1 |
| `certificate-info` | `packages/app-builder-lib/src/codeSign/windowsSignToolManager.ts:246` | `executeAppBuilderAsJson` | 1 |
| `blockmap` | `packages/app-builder-lib/src/targets/differentialUpdateInfoBuilder.ts:67` | `executeAppBuilderAsJson` | 1 (append mode) |
| `blockmap` | `packages/app-builder-lib/src/targets/differentialUpdateInfoBuilder.ts:73` | `executeAppBuilderAsJson` | 1 (file output) |
| `rebuild-node-modules` | `packages/app-builder-lib/src/util/yarn.ts:186` | `executeAppBuilderAndWriteJson` | 1 |
| `get-bucket-location` | `packages/electron-publish/src/s3/s3Publisher.ts:25` | `executeAppBuilder` (raw) | 1 |
| `icon` | `packages/app-builder-lib/src/platformPackager.ts:877` | `executeAppBuilderAsJson` | 1 |
| `node-dep-tree` | `packages/app-builder-lib/src/util/packageDependencies.ts:15` | `executeAppBuilderAsJson` | 1 |
| `appimage` | `packages/app-builder-lib/src/targets/appimage/AppImageTarget.ts:160` | `executeAppBuilderAsJson` | 1 |
| `proton-native` | `packages/app-builder-lib/src/frameworks/LibUiFramework.ts:71,90` | `executeAppBuilder` (raw) | 2 |

---

## Command-by-Command Implementation Reference

### 1. `ksuid`

**File:** `packages/app-builder-lib/src/targets/nsis/NsisTarget.ts:309`

**What it does:** Generates a K-Sortable Unique Identifier (lexicographically sortable, time-prefixed UUID). Used as the default temp directory name (`UNPACK_DIR_NAME`) when building portable NSIS installers. Must be stable-looking (not just random) so the directory name is reproducible across builds for the same version.

**Current call:**
```typescript
defines.UNPACK_DIR_NAME = unpackDirName || (await executeAppBuilder(["ksuid"]))
```

**JS Replacement:** Drop-in npm package `ksuid` (https://www.npmjs.com/package/ksuid):
```typescript
import { KSUID } from "ksuid"
defines.UNPACK_DIR_NAME = unpackDirName || (await KSUID.random()).string
```
Or a simpler alternative using `crypto`:
```typescript
import { randomBytes } from "crypto"
// 20-byte time-prefixed ID, base62 encoded (mirrors KSUID format)
const ts = Math.floor(Date.now() / 1000)
const tsBytes = Buffer.allocUnsafe(4)
tsBytes.writeUInt32BE(ts)
const id = Buffer.concat([tsBytes, randomBytes(16)]).toString("base64url")
```

**Complexity:** Low — any unique-string generator works here.

---

### 2. `certificate-info`

**File:** `packages/app-builder-lib/src/codeSign/windowsSignToolManager.ts:246`

**What it does:** Reads a Windows code-signing certificate (`.pfx` / PKCS#12 file), decrypts it with the provided password, and returns a JSON object with the subject DN and common name. Used to auto-detect `win.publisherName` from the certificate.

**Current call:**
```typescript
result = await executeAppBuilderAsJson<any>(["certificate-info", "--input", file, "--password", password])
// Returns: { commonName: string, bloodyMicrosoftSubjectDn: string, error?: string }
```

**JS Replacement:** Use `node-forge` (already likely a transitive dependency) or `@peculiar/x509`:

```typescript
import * as forge from "node-forge"
import { readFile } from "fs/promises"

async function getCertInfoJs(file: string, password: string): Promise<CertificateInfo> {
  const pfxDer = await readFile(file)
  const pfxAsn1 = forge.asn1.fromDer(pfxDer.toString("binary"))
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password)
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })
  const cert = certBags[forge.pki.oids.certBag]![0].cert!
  const subject = cert.subject
  const commonName = subject.getField("CN")?.value ?? ""
  // Reconstruct the subject DN in Windows format
  const dn = subject.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(", ")
  return { commonName, bloodyMicrosoftSubjectDn: dn }
}
```

Alternative: `@peculiar/x509` with `pkijs` for strict PKCS#12 parsing.

**Complexity:** Medium — PKCS#12 parsing is well-supported in JS but the exact DN formatting must match what Windows expects for `publisherName`.

---

### 3. `blockmap`

**Files:**
- `packages/app-builder-lib/src/targets/differentialUpdateInfoBuilder.ts:67` — `appendBlockmap(file)`: embeds blockmap at the end of the input archive (append mode, deflate compression)
- `packages/app-builder-lib/src/targets/differentialUpdateInfoBuilder.ts:73` — `createBlockmap(file, ...)`: writes a separate `.blockmap` file alongside the artifact

**What it does:** Splits a binary file (zip, exe, AppImage) into content-defined chunks using a rolling-hash algorithm. Outputs a JSON manifest listing each chunk's offset, size, and SHA-256 hash. This manifest is used by `electron-updater` to perform differential downloads — only changed chunks are fetched.

**Current calls:**
```typescript
// Append mode (embed in file):
executeAppBuilderAsJson<BlockMapDataHolder>(["blockmap", "--input", file, "--compression", "deflate"])

// File output mode (separate .blockmap file):
executeAppBuilderAsJson<BlockMapDataHolder>(["blockmap", "--input", file, "--output", blockMapFile])
```

**Output type** (`BlockMapDataHolder` from `builder-util-runtime`):
```typescript
interface BlockMapDataHolder {
  size: number       // total file size
  blockMapSize?: number
  sha512: string     // SHA-512 of entire file (base64)
  isAdminRightsRequired?: boolean
  // internal: array of block offsets/hashes used by updater
}
```

**JS Replacement:** The blockmap algorithm is documented and the format is defined in the `builder-util-runtime` package. A JS implementation requires:
1. Read the file in a streaming fashion
2. Apply a content-defined chunking algorithm (e.g., FastCDC or the existing rolling-hash used by app-builder)
3. For each chunk: record offset, length, SHA-256 hash
4. Compute SHA-512 of the whole file
5. Serialize as the `BlockMapDataHolder` format (possibly gzip/deflate compressed)

The existing format is documented at: https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/blockMapApi.ts

Existing npm candidates: `@electron/asar` deals with block splitting but not the same format. A custom implementation using Node.js `crypto` + streaming is required.

**Complexity:** High — this is the most algorithmically complex piece. The chunk boundary algorithm must exactly match what `electron-updater` expects for differential updates to work correctly. Consider vendoring the algorithm from the Go source or from an existing JS reference implementation.

---

### 4. `rebuild-node-modules`

**File:** `packages/app-builder-lib/src/util/yarn.ts:186`

**What it does:** Rebuilds native Node.js addons (`.node` files) for the target Electron version/architecture/platform. Only invoked when `config.nativeRebuilder === "legacy"`.

**Current call:**
```typescript
return executeAppBuilderAndWriteJson(["rebuild-node-modules"], configuration, { env, cwd: appDir })
// stdin JSON: { platform, arch, buildFromSource, dependencies, nodeExecPath, additionalArgs, execPath }
```

**JS Replacement:** The non-legacy code path already uses `@electron/rebuild` (the canonical JS solution). The migration is:

1. Remove the `config.nativeRebuilder === "legacy"` branch entirely.
2. Route all rebuild calls through the existing `@electron/rebuild` path.
3. Remove the `"legacy"` option from `nativeRebuilder` config type.

```typescript
// In yarn.ts — delete the entire if (config.nativeRebuilder === "legacy") branch
// The else branch already handles this correctly with @electron/rebuild
```

**Complexity:** Low — the JS replacement already exists in the codebase; this is a deletion task.

---

### 5. `get-bucket-location`

**File:** `packages/electron-publish/src/s3/s3Publisher.ts:25`

**What it does:** Queries the AWS API to determine the region of an S3 bucket. Called only when the bucket name contains dots (dotted bucket names require path-style endpoint URLs which must include the region).

**Current call:**
```typescript
options.region = await executeAppBuilder(["get-bucket-location", "--bucket", bucket])
// Returns: AWS region string e.g. "us-east-1"
```

**JS Replacement:** Use the AWS SDK v3 (already available as a dependency in `electron-publish`):

```typescript
import { S3Client, GetBucketLocationCommand } from "@aws-sdk/client-s3"

async function getBucketLocation(bucket: string): Promise<string> {
  const client = new S3Client({})
  const response = await client.send(new GetBucketLocationCommand({ Bucket: bucket }))
  // AWS returns null for us-east-1 (the default region)
  return response.LocationConstraint ?? "us-east-1"
}
```

**Complexity:** Low — direct SDK call, one-to-one replacement.

---

### 6. `icon` (lower priority)

**File:** `packages/app-builder-lib/src/platformPackager.ts:877`

**What it does:** Converts application icons between formats (PNG → ICNS for macOS, PNG → ICO for Windows) and validates icon sizes. Searches multiple root directories for icon sources and fallbacks.

**Current call args:** `["icon", "--format", outputFormat, "--root", ..., "--out", ..., "--input", ..., "--fallback-input", ...]`

**JS Replacement candidates:**
- `sharp` — high-quality image conversion (PNG ↔ WebP, resize), but no native ICNS/ICO support
- `png-to-ico` / `png2icons` — pure-JS ICO/ICNS creation
- `icns-lib` — ICNS read/write
- `electron-icon-builder` — wraps these for Electron use

**Complexity:** High — the current implementation handles multi-resolution ICO/ICNS creation with fallback logic. A complete replacement needs to replicate all size variants (16, 32, 64, 128, 256, 512, 1024px for ICNS; multiple sizes for ICO) and error reporting.

---

### 7. `node-dep-tree` (lower priority)

**File:** `packages/app-builder-lib/src/util/packageDependencies.ts:15`

**What it does:** Walks `node_modules` to build a tree (or flat list) of production dependencies with name, version, and directory path. Supports excluding specific deps.

**Current call:** `["node-dep-tree", "--dir", projectDir, "--flatten"?, "--exclude-dep", ...]`

**JS Replacement:** Walk `node_modules` directly using Node.js `fs`:
```typescript
// Recursive walk reading package.json files from each node_modules entry
// Already partially implemented in packageDependencies.ts for non-legacy paths
```
Or use `read-package-json-fast` + custom walker. The existing `getProductionDependencies()` function in the codebase likely already has an alternative path.

**Complexity:** Medium — straightforward but must handle hoisted modules, pnpm symlinks, and workspace layouts correctly.

---

### 8. `appimage` (keep native tooling for now)

**File:** `packages/app-builder-lib/src/targets/appimage/AppImageTarget.ts:160`

**What it does:** Packages a staged application directory into AppImage format using FUSE2-based tooling. Produces a self-mounting executable for Linux.

**JS Replacement:** No pure-JS AppImage builder exists. Options:
- Use `appimagetool` binary directly (replaces one binary with another)
- Use `linuxdeploy` + plugins
- Keep app-builder for this specific command while migrating others

**Complexity:** Very High / Out of scope for initial migration.

---

### 9. `proton-native` (deprecated, remove)

**File:** `packages/app-builder-lib/src/frameworks/LibUiFramework.ts:71,90`

**What it does:** Downloads and stages the Proton Native runtime. Proton Native is an unmaintained project.

**Recommendation:** Remove `LibUiFramework` entirely or stub it out with a deprecation error. If the framework is removed, `proton-native` calls disappear with it.

**Complexity:** Low — deletion.

---

## Migration Priority Order

| Priority | Command | Effort | Strategy |
|---|---|---|---|
| 1 | `rebuild-node-modules` | Low | Delete legacy branch; `@electron/rebuild` already handles it |
| 2 | `get-bucket-location` | Low | Replace with AWS SDK v3 `GetBucketLocationCommand` |
| 3 | `ksuid` | Low | Replace with `ksuid` npm package or `crypto.randomBytes` |
| 4 | `certificate-info` | Medium | Replace with `node-forge` PKCS#12 parsing |
| 5 | `node-dep-tree` | Medium | Write custom `node_modules` walker or use existing alternative path |
| 6 | `blockmap` | High | Port algorithm to JS (must match updater's expected format exactly) |
| 7 | `icon` | High | Assemble from `sharp` + `png2icons` + `icns-lib` |
| 8 | `proton-native` | Low | Remove `LibUiFramework` (deprecated framework) |
| 9 | `appimage` | Very High | Keep native tooling or use `appimagetool` directly |

---

## Files to Modify

**Core binary invocation (remove after all commands migrated):**
- `packages/builder-util/src/util.ts` — `executeAppBuilder()` function (delete entirely at end)
- `packages/app-builder-lib/src/util/appBuilder.ts` — `executeAppBuilderAsJson`, `executeAppBuilderAndWriteJson` (delete at end)
- `packages/builder-util/package.json` — remove `app-builder-bin` dependency

**Per-command file list:**
- `rebuild-node-modules` → `packages/app-builder-lib/src/util/yarn.ts`
- `get-bucket-location` → `packages/electron-publish/src/s3/s3Publisher.ts`
- `ksuid` → `packages/app-builder-lib/src/targets/nsis/NsisTarget.ts`
- `certificate-info` → `packages/app-builder-lib/src/codeSign/windowsSignToolManager.ts`
- `node-dep-tree` → `packages/app-builder-lib/src/util/packageDependencies.ts`
- `blockmap` → `packages/app-builder-lib/src/targets/differentialUpdateInfoBuilder.ts`
- `icon` → `packages/app-builder-lib/src/platformPackager.ts`
- `appimage` → `packages/app-builder-lib/src/targets/appimage/AppImageTarget.ts`
- `proton-native` → `packages/app-builder-lib/src/frameworks/LibUiFramework.ts`

---

## Verification Plan

After each command is migrated:

1. **Unit tests:** Run `pnpm test` in the relevant package.
2. **Integration test — Windows (ksuid, certificate-info, rebuild-node-modules):** Build a portable NSIS installer; verify `UNPACK_DIR_NAME` is set, that signing resolves publisher name from cert, and that native modules rebuild correctly.
3. **Integration test — S3 (get-bucket-location):** In the test environment (`electron-builder-test/`), publish to a dotted S3 bucket name; verify region is auto-detected.
4. **Integration test — differential updates (blockmap):** Build an app, then build a delta update; verify `electron-updater` can apply a patch correctly (chunk boundaries must be bit-for-bit identical to old output).
5. **End-to-end smoke test:** `cd /Users/mikemaietta/Development/electron-builder-test && pnpm run test` covering macOS, Linux, and Windows targets.
6. **Final check:** Grep codebase for `app-builder-bin` and `executeAppBuilder` — both should return zero results after full migration.

---

## Notes on `blockmap` Algorithm

The app-builder Go source (https://github.com/develar/app-builder) uses a custom rolling-hash based content-defined chunking (CDC) algorithm. The JS port must produce identical chunk boundaries for the differential updater to interoperate with previously published blockmaps. Key parameters (as seen in Go source):
- Minimum chunk size: 4 KB
- Maximum chunk size: 32 KB  
- Average target chunk size: ~8 KB
- Rolling hash: Rabin fingerprinting or similar

Before implementing, confirm chunk boundary algorithm by cross-testing against the existing binary output on a known input file.
