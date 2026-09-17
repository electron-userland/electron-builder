import { createUpdateManifestSignatures, serializeToYaml } from "builder-util"
import { PublishConfiguration, UpdateInfo } from "builder-util-runtime"
import { outputFile, readdir, readFile, stat } from "fs-extra"
import { load } from "js-yaml"
import path from "path"

/**
 * Pure helpers for the signed-update-manifest blackbox e2e tests (see blackboxUpdateHelpers.ts). Kept free
 * of the harness' side effects (VM detection, builds) so they can be unit-tested without a packaged app.
 */

export const UPDATE_MANIFEST_FILE_PATTERN = /^latest.*\.yml$/

/** `app-update.yml` as written into the packaged app's resources by PublishManager. */
export type EmbeddedUpdateConfig = PublishConfiguration & { updateManifestPublicKey?: string | Array<string> | null }

/**
 * Returns a copy of `info` with every existing signature removed and, when `privateKeyPems` is non-empty,
 * re-signed by exactly those keys the way updateInfoBuilder writes a manifest: one tagged `signatures`
 * entry per key and the legacy single `signature` field repeating the first key's signature.
 * An empty key list yields an unsigned manifest.
 */
export function resignManifest(info: UpdateInfo, privateKeyPems: Array<string>): UpdateInfo {
  const { signature: _signature, signatures: _signatures, ...unsigned } = info
  if (privateKeyPems.length === 0) {
    return unsigned
  }
  const signatures = createUpdateManifestSignatures(unsigned, privateKeyPems)
  return { ...unsigned, signature: signatures[0].signature, signatures }
}

/** The `latest*.yml` update manifests directly inside `dir` (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`, ...). */
export async function findUpdateManifests(dir: string): Promise<Array<string>> {
  const names = await readdir(dir)
  return names
    .filter(name => UPDATE_MANIFEST_FILE_PATTERN.test(name))
    .sort()
    .map(name => path.join(dir, name))
}

/** Parses the single `latest*.yml` written into a build's output directory. */
export async function readUpdateManifest(distDir: string): Promise<UpdateInfo> {
  const files = await findUpdateManifests(distDir)
  if (files.length !== 1) {
    throw new Error(`Expected exactly one latest*.yml in ${distDir}, found: ${files.map(it => path.basename(it)).join(", ") || "none"}`)
  }
  return load(await readFile(files[0], "utf8")) as UpdateInfo
}

/**
 * Rewrites every served `latest*.yml` in `serverRoot` through `mutate` (serialized like updateInfoBuilder does)
 * and returns a function that restores the original files byte-for-byte.
 */
export async function rewriteServedManifests(serverRoot: string, mutate: (info: UpdateInfo) => UpdateInfo): Promise<() => Promise<void>> {
  const files = await findUpdateManifests(serverRoot)
  if (files.length === 0) {
    throw new Error(`No latest*.yml found in server root ${serverRoot}`)
  }
  const originals = new Map<string, Buffer>()
  for (const file of files) {
    originals.set(file, await readFile(file))
  }
  for (const [file, content] of originals) {
    const info = load(content.toString("utf8")) as UpdateInfo
    await outputFile(file, serializeToYaml(mutate(info), false, true))
  }
  return async () => {
    for (const [file, content] of originals) {
      await outputFile(file, content)
    }
  }
}

/** Breadth-first search for a file named `fileName` below `dir`, at most `maxDepth` directories deep. */
export async function findFile(dir: string, fileName: string, maxDepth = 6): Promise<string | null> {
  let level = [dir]
  for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
    const next: Array<string> = []
    for (const current of level) {
      let names: Array<string>
      try {
        names = await readdir(current)
      } catch {
        continue
      }
      for (const name of names) {
        const full = path.join(current, name)
        const info = await stat(full).catch(() => null)
        if (info == null) {
          continue
        }
        if (info.isFile() && name === fileName) {
          return full
        }
        if (info.isDirectory()) {
          next.push(full)
        }
      }
    }
    level = next
  }
  return null
}

/**
 * Parses the `app-update.yml` electron-builder embedded into the packaged app found below `distDir`
 * (`mac[-arch]/TestApp.app/Contents/Resources`, `win-unpacked/resources` or `linux-unpacked/resources`).
 * This is the very file the installed app ships with, so its `updateManifestPublicKey` is the trust list an
 * install of that version would enforce.
 */
export async function readEmbeddedUpdateConfig(distDir: string): Promise<EmbeddedUpdateConfig> {
  const file = await findFile(distDir, "app-update.yml")
  if (file == null) {
    throw new Error(`No app-update.yml found in the packaged app below ${distDir}`)
  }
  return load(await readFile(file, "utf8")) as EmbeddedUpdateConfig
}
