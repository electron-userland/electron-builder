import * as get from "@electron/get"
import { ElectronDownloadCacheMode } from "@electron/get"
import * as fs from "fs/promises"
import { log, parseValidEnvVarUrl } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { sanitizeFileName } from "builder-util/out/filename"
import * as path from "path"
import { downloadBuilderToolset, getBinariesMirrorUrl, getCacheDirectory } from "./util/electronGet"

const versionToPromise = new Map<string, Promise<string>>()

export async function download(url: string, output: string, checksum?: string | null): Promise<void> {
  const filenameWithExt = path.basename(new URL(url).pathname)
  if (checksum == null) {
    // Without a checksum, a MITM attacker who can intercept the download (e.g.
    // via a rogue mirror, a tampered CDN edge, or a DNS-spoofing attack) can
    // substitute a malicious payload.  Callers should supply a checksum whenever
    // possible.  See security audit finding #10.
    log.warn({ url }, "downloading without an integrity checksum — the download is not verified against a known-good hash")
  }
  const downloadedFile = await get.downloadArtifact({
    version: "9.9.9",
    artifactName: filenameWithExt,
    cacheRoot: path.resolve(getCacheDirectory({ allowEnvVarOverride: true }), "downloads"),
    cacheMode: ElectronDownloadCacheMode.ReadWrite,
    ...(checksum != null ? { checksums: { [filenameWithExt]: checksum } } : { unsafelyDisableChecksums: true }),
    mirrorOptions: { resolveAssetURL: async () => Promise.resolve(url) },
    isGeneric: true,
  })
  await fs.copyFile(downloadedFile, output)
}

export function getBinFromCustomLoc(name: string, version: string, binariesLocUrl: string, checksum: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(dirName, binariesLocUrl, checksum)
}

/**
 * Validates a binary-download custom-directory value read from an environment
 * variable.  These values are interpolated directly into a download URL; a
 * malicious value (e.g. set via a postinstall hook in node_modules) could
 * redirect tool downloads to an attacker-controlled server.
 *
 * Allowed: relative path components such as "v1.0.0-custom" or "my-mirror/nsis".
 * Rejected: anything containing "://", ".." (traversal), or a leading "/" (which
 * could make the resulting URL protocol-relative or change the host).
 */
function validateBinaryCustomDir(envVarName: string, value: string): string {
  if (value.includes("://") || value.includes("..") || value.startsWith("/")) {
    throw new Error(
      `${envVarName} must be a safe relative path component (e.g. "v1.0.0-custom"). ` +
        `Values containing "://", "..", or a leading "/" are not allowed. Got: "${value}"`
    )
  }
  return value
}

export function getBinFromUrl(releaseName: string, filenameWithExt: string, checksum: string, githubOrgRepo = "electron-userland/electron-builder-binaries"): Promise<string> {
  if (/[/\\]|^\.\./.test(filenameWithExt) || filenameWithExt.includes("..")) {
    throw new Error(`getBinFromUrl: unsafe filenameWithExt "${filenameWithExt}" — must be a plain filename with no path separators or traversal sequences`)
  }
  let url: string
  const overrideUrl = parseValidEnvVarUrl("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL")
  if (overrideUrl != null) {
    url = overrideUrl + "/" + filenameWithExt
  } else {
    const baseUrl = getBinariesMirrorUrl(githubOrgRepo)
    // Any of these env vars can redirect downloads to a custom release directory.
    // Validate each one before interpolating into the URL to prevent a malicious
    // postinstall script from pointing the download at an attacker-controlled server.
    const rawCustomDir =
      process.env.NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR ||
      process.env.npm_config_electron_builder_binaries_custom_dir ||
      process.env.npm_package_config_electron_builder_binaries_custom_dir ||
      process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
    const middleUrl = rawCustomDir != null ? validateBinaryCustomDir("ELECTRON_BUILDER_BINARIES_CUSTOM_DIR", rawCustomDir) : releaseName
    url = `${baseUrl}${middleUrl}/${filenameWithExt}`
  }

  const cacheKey = `${releaseName}-${path.basename(filenameWithExt, path.extname(filenameWithExt))}`
  return getBin(cacheKey, url, checksum)
}

export function getBin(cacheKey: string, url?: string | Nullish, checksum?: string | Nullish): Promise<string> {
  const cacheName = sanitizeFileName(`${process.env.ELECTRON_BUILDER_CACHE ?? ""}${cacheKey}`)
  let promise = versionToPromise.get(cacheName)
  if (promise != null) {
    return promise
  }

  if (url == null) {
    throw new Error(
      `getBin("${cacheKey}"): a download URL is required. ` +
        `The no-URL legacy path (e.g. winCodeSign "0.0.0") is no longer used — ` +
        `it now downloads from winCodeSign-2.6.0 automatically.`
    )
  }

  const filenameWithExt = path.basename(url)
  const overrideUrl = url.substring(0, url.lastIndexOf("/"))
  const releaseName = path.basename(overrideUrl)

  promise = downloadBuilderToolset({
    releaseName,
    filenameWithExt,
    checksums: checksum != null ? { [filenameWithExt]: checksum } : undefined,
    overrideUrl,
  })
  versionToPromise.set(cacheName, promise)
  return promise
}
