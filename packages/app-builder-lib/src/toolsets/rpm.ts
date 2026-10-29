import { exec, InvalidConfigurationError, log, stripSensitiveEnvVars } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { constants as fsConstants } from "fs"
import { access, stat } from "fs/promises"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { computeEnv } from "../util/bundledTool.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest rpm bundle — selected when the config is unset / "latest".
const RPM_LATEST = "1.0.0"

export const RPM_TOOLSET_MIGRATION_URL = "https://www.electron.build/docs/migration/v27-build-changes#rpm-builds-use-a-bundled-rpmbuild"

/**
 * Portable `rpmbuild` (rpm 6.1.0) built by electron-builder-binaries `packages/rpm`. The archive has no top-level directory:
 * `bin/rpmbuild` and `bin/rpm` are wrappers that set `RPM_CONFIGDIR`/`MAGIC` relative to the bundle and load only the bundled
 * macros (host `/etc/rpm`, `~/.rpmmacros` are ignored), with electron-builder's pinned `_rpmformat 4` / `_build_id_links none`.
 */
export const rpmChecksums = {
  "1.0.0": {
    "rpm-6.1.0-linux-amd64.7z": "e17b704b65b9192ca9fa1eaca3e5e4d80b0d430e6273286d065b8e75cea52d16",
    "rpm-6.1.0-linux-arm64v8.7z": "1a284057e5151c467cb71e36222f21754f5554249f0d562ce2ecaae63d8ec83b",
    "rpm-6.1.0-darwin-arm64.7z": "e3398a76ac22846faa238ed68c72d829811c89c7c9962d49eaff4f6db30cb774",
  },
} as const

type RpmBundleVersion = keyof typeof rpmChecksums

/** The bundle archive for the build host, or `null` when none is published (Intel macOS, 32-bit Linux, Windows, …). */
export function getRpmBundleFilename(platform: NodeJS.Platform = process.platform, arch: string = process.arch): keyof (typeof rpmChecksums)[RpmBundleVersion] | null {
  if (platform === "linux") {
    if (arch === "x64") {
      return "rpm-6.1.0-linux-amd64.7z"
    }
    if (arch === "arm64") {
      return "rpm-6.1.0-linux-arm64v8.7z"
    }
  } else if (platform === "darwin" && arch === "arm64") {
    return "rpm-6.1.0-darwin-arm64.7z"
  }
  return null
}

function describeSelection(toolset: Exclude<ToolsetConfig["rpm"], object> | Nullish, version: string): string {
  return toolset == null ? `defaults to the bundled rpmbuild (rpm@${version}) in v27` : `"${toolset}" selects the bundled rpmbuild (rpm@${version})`
}

const SYSTEM_HINT = 'Set toolsets.rpm: "system" to build the rpm target with the rpmbuild installed on this machine.'

/** What the published bundles are built against, for the error when one cannot run: the probe, not this text, decides. */
const RPM_BUNDLE_HOST_FLOORS = "The published bundles need glibc 2.28 or newer on Linux (not musl) and macOS 15 or newer on Apple silicon."

/** How long `rpmbuild --version` may take: it only loads the binary and the bundle's macros, so a hang means it cannot run. */
export const RPM_PROBE_TIMEOUT_MS = 30_000
// at most this many lines of the probe's stderr go into the error: enough for a dynamic loader message
const PROBE_EXCERPT_LINES = 5
const PROBE_EXCERPT_LINE_LENGTH = 300

/**
 * fpm finds `rpmbuild` on `PATH` only: a bundle without an executable `bin/rpmbuild` would make it run the host one silently,
 * which is the fallback the bundle exists to avoid.
 *
 * @param explain why the bundle lacks it and what to do, given the path that was looked for
 */
async function assertRpmbuildInBundle(binDir: string, explain: (rpmbuild: string) => string): Promise<string> {
  const rpmbuild = path.join(binDir, "rpmbuild")
  const isExecutableFile = await stat(rpmbuild)
    .then(s => s.isFile() && access(rpmbuild, fsConstants.X_OK).then(() => true))
    .catch(() => false)
  if (!isExecutableFile) {
    throw new InvalidConfigurationError(`${explain(rpmbuild)} See ${RPM_TOOLSET_MIGRATION_URL}`)
  }
  return binDir
}

// one probe per bundle bin directory per process; a failed probe stays failed (the bundle and the host do not change mid-build)
const rpmbuildProbes = new Map<string, Promise<string | null>>()

/**
 * Runs the bundle's `rpmbuild --version` once, with the environment fpm will run it with. A bundle that cannot run on this host
 * (macOS older than its deployment target, a glibc older than it was built against, musl, a missing ELF interpreter, …) fails here
 * with the dynamic loader's own message, rather than deep inside fpm.
 *
 * @returns `null` when it runs, otherwise why not, with an excerpt of its output
 */
function probeRpmbuild(binDir: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  let probe = rpmbuildProbes.get(binDir)
  if (probe == null) {
    const rpmbuild = path.join(binDir, "rpmbuild")
    probe = exec(rpmbuild, ["--version"], { env: { ...env, PATH: computeEnv(env.PATH, [binDir]) }, timeout: RPM_PROBE_TIMEOUT_MS }).then(
      () => null,
      (error: unknown) => `${rpmbuild} --version ${describeProbeFailure(error)}`
    )
    rpmbuildProbes.set(binDir, probe)
  }
  return probe
}

/** Never throws: it only words an error that is already being reported. */
function describeProbeFailure(error: unknown): string {
  // builder-util's ExecError keeps Node's execFile error, whose message is "Command failed: <cmd>\n<stderr>", as its cause
  const execCause: unknown = error instanceof Error ? (error as { cause?: unknown }).cause : undefined
  const cause = execCause instanceof Error ? execCause : error
  if (!(cause instanceof Error)) {
    return `failed: ${String(cause)}`
  }
  const { code, signal, killed } = cause as NodeJS.ErrnoException & { signal?: NodeJS.Signals | null; killed?: boolean }
  let reason: string
  if (killed === true && signal != null) {
    reason = `did not finish within ${RPM_PROBE_TIMEOUT_MS / 1000}s`
  } else if (signal != null) {
    reason = `was killed by ${signal}`
  } else if (typeof code === "number") {
    reason = `exited with code ${code}`
  } else if (typeof code === "string") {
    reason = `could not be started (${code})`
  } else {
    reason = "failed"
  }
  const lines = cause.message
    .split(/\r?\n/)
    .filter((line, index) => !(index === 0 && line.startsWith("Command failed:")))
    .map(line => line.trim())
    .filter(line => line.length > 0)
  if (lines.length === 0) {
    return reason
  }
  const excerpt = lines.slice(0, PROBE_EXCERPT_LINES).map(line => (line.length > PROBE_EXCERPT_LINE_LENGTH ? `${line.slice(0, PROBE_EXCERPT_LINE_LENGTH)}…` : line))
  if (lines.length > PROBE_EXCERPT_LINES) {
    excerpt.push(`… (${lines.length - PROBE_EXCERPT_LINES} more lines)`)
  }
  return `${reason}:\n${excerpt.map(line => `  ${line}`).join("\n")}`
}

/**
 * Resolves `toolsets.rpm` for the `rpm` target.
 *
 * @param env the environment fpm runs with; the bundle's `rpmbuild` is probed with it (plus the bundle on `PATH`) before it is used
 * @returns the bundle's `bin` directory (holding the `rpmbuild` wrapper), to put first on the `PATH` fpm runs with, or `null` for
 * `"system"`: fpm then finds the host `rpmbuild` on `PATH`, as before v27.
 */
export async function getRpmToolsetBinDir(
  toolset: ToolsetConfig["rpm"] | Nullish,
  resourcesDir: string,
  env: NodeJS.ProcessEnv = stripSensitiveEnvVars(process.env)
): Promise<string | null> {
  // A custom toolset is an explicit user override — honored on every platform.
  if (typeof toolset === "object" && toolset != null) {
    const bundleDir = await getCustomToolsetPath(toolset, resourcesDir)
    const binDir = await assertRpmbuildInBundle(
      path.join(bundleDir, "bin"),
      rpmbuild =>
        `The custom toolsets.rpm bundle (${toolset.url}) has no executable bin/rpmbuild (looked for ${rpmbuild}). A custom rpm toolset must have the ` +
        `published bundle's layout: bin/rpmbuild at the root of the archive or directory, with no top-level directory. Without it fpm would silently ` +
        `run the host rpmbuild; to build with the host rpmbuild, set toolsets.rpm: "system".`
    )
    const failure = await probeRpmbuild(binDir, env)
    if (failure != null) {
      throw new InvalidConfigurationError(`The custom toolsets.rpm bundle (${toolset.url}) cannot run on this host: ${failure}\n${SYSTEM_HINT} See ${RPM_TOOLSET_MIGRATION_URL}`)
    }
    return binDir
  }
  if (toolset === "system") {
    return null
  }

  const version = resolveToolsetVersion<RpmBundleVersion>(toolset, RPM_LATEST)
  const filename = getRpmBundleFilename()
  if (filename == null) {
    // No silent fallback to the host rpmbuild: the output would then depend on the build host again, which is what the bundle avoids.
    throw new InvalidConfigurationError(
      `toolsets.rpm ${describeSelection(toolset, version)}, which is not published for ${process.platform} ${process.arch} (published for Linux x64, Linux arm64 and macOS arm64). ` +
        `${SYSTEM_HINT} See ${RPM_TOOLSET_MIGRATION_URL}`
    )
  }

  if (toolset == null) {
    // v27 default change, announced once per process; an explicit "latest" or version is the user's own choice and is not announced.
    log
      .once("toolset-rpm-default")
      .info(
        { toolset: `rpm@${version}`, optOut: 'toolsets.rpm: "system"', docs: RPM_TOOLSET_MIGRATION_URL },
        'v27: the rpm target now builds with the bundled rpmbuild instead of the one installed on this machine, so host rpm macros (~/.rpmmacros, /etc/rpm) no longer apply. Set toolsets.rpm: "system" to keep using the host rpmbuild'
      )
  }

  const bundleDir = await downloadBuilderToolset({
    releaseName: `rpm@${version}`,
    filenameWithExt: filename,
    checksums: rpmChecksums[version],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  const binDir = await assertRpmbuildInBundle(
    path.join(bundleDir, "bin"),
    rpmbuild =>
      `The downloaded rpm@${version} bundle has no executable bin/rpmbuild (looked for ${rpmbuild}): the cached bundle is incomplete or damaged. ` +
      `Delete ${bundleDir} to download it again. ${SYSTEM_HINT}`
  )
  const failure = await probeRpmbuild(binDir, env)
  if (failure != null) {
    throw new InvalidConfigurationError(
      `toolsets.rpm ${describeSelection(toolset, version)}, which cannot run on this host: ${failure}\n${RPM_BUNDLE_HOST_FLOORS} ${SYSTEM_HINT} See ${RPM_TOOLSET_MIGRATION_URL}`
    )
  }
  return binDir
}
