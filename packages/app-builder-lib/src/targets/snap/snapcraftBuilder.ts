import { RemoteBuildOptions } from "../../options/SnapOptions"
import { importCredentialContent } from "../../codeSign/codesign"
import { InvalidConfigurationError, log, spawn } from "builder-util"
import * as childProcess from "child_process"
import { copyFile, ensureDir, pathExists, readdir, remove } from "fs-extra"
import * as path from "path"
import * as util from "util"
import { SnapcraftYAML } from "./snapcraft"

const execAsync = util.promisify(childProcess.exec)

export const SNAPCRAFT_YAML_OPTIONS = { indent: 2, lineWidth: -1, noRefs: true } as const
export const DEFAULT_STAGE_PACKAGES: string[] = ["libnspr4", "libnss3", "libxss1", "libappindicator3-1", "libsecret-1-0"]

interface BuildSnapOptions {
  /** The snapcraft YAML configuration */
  snapcraftConfig: SnapcraftYAML
  /** Working directory where snapcraft.yaml is written and the build executes */
  stageDir: string
  /** Whether to use remote build (builds on Launchpad) */
  remoteBuild?: RemoteBuildOptions
  /** Whether to use LXD for local builds */
  useLXD?: boolean
  /** Whether to use Multipass for local builds */
  useMultipass?: boolean
  /** Whether to use destructive mode (builds directly on host, Linux only) */
  useDestructiveMode?: boolean
  /** The snap output path */
  artifactPath: string
}

/**
 * Validates snapcraft.yaml using snapcraft's built-in `expand-extensions` command.
 * Failures are non-fatal: a warning is logged and the build continues.
 */
async function validateSnapcraftYamlWithCLI(workDir: string): Promise<void> {
  try {
    const { stdout } = await execAsync("snapcraft expand-extensions", {
      cwd: workDir,
      timeout: 30000,
    })
    log.debug({ expandedYaml: stdout }, "validated extended snapcraft.yaml")
  } catch (error: any) {
    log.error({ error: error.message, stderr: error.stderr }, "snapcraft.yaml validation failed")
    throw new Error(
      `Invalid snapcraft.yaml: ${error.message}\n` +
        `Snapcraft output: ${error.stderr || error.stdout || "No output"}\n` +
        `Run 'snapcraft expand-extensions' in ${workDir} for more details`
    )
  }
}

/**
 * Validates snapcraft.yaml configuration with basic client-side checks
 * This is a fast pre-check before running the full CLI validation
 */
function validateSnapcraftConfig(config: SnapcraftYAML): void {
  const errors: string[] = []
  const warnings: string[] = []

  // Required fields
  if (!config.name) {
    errors.push("name is required")
  }
  if (!config.base) {
    errors.push("base is required")
  }
  if (!config.confinement) {
    errors.push("confinement is required")
  }
  if (!config.parts || Object.keys(config.parts).length === 0) {
    errors.push("at least one part is required")
  }

  // Name validation
  if (config.name) {
    if (!/^[a-z0-9-]*$/.test(config.name)) {
      errors.push("name must only contain lowercase letters, numbers, and hyphens")
    }
    if (config.name.length > 40) {
      errors.push("name must be 40 characters or less")
    }
    if (config.name.startsWith("-") || config.name.endsWith("-")) {
      errors.push("name cannot start or end with a hyphen")
    }
  }

  // Parts validation
  Object.entries(config.parts).forEach(([partName, part]) => {
    if (!part.plugin) {
      errors.push(`part '${partName}' missing required 'plugin' field`)
    }
  })

  // Apps validation
  if (config.apps) {
    Object.entries(config.apps).forEach(([appName, app]) => {
      if (!app.command) {
        errors.push(`app '${appName}' missing required 'command' field`)
      }
    })
  }

  // Summary validation
  if (config.summary && config.summary.length > 78) {
    warnings.push(`summary is ${config.summary.length} characters (recommended: 78 or less)`)
  }

  // Log results
  if (errors.length > 0) {
    log.error({ errors }, "snapcraft.yaml validation failed")
    throw new InvalidConfigurationError(`Invalid snapcraft.yaml: ${errors.join(", ")}`)
  }

  if (warnings.length > 0) {
    log.warn({ warnings }, "snapcraft.yaml validation warnings")
  }
}

/**
 * Retry wrapper for operations that may fail transiently
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelay?: number
    retryableErrors?: string[]
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 5000, retryableErrors = ["network timeout", "connection refused", "temporary failure", "snap store error"] } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const errorMessage = error.message?.toLowerCase() || ""
      const isRetryable = retryableErrors.some(pattern => errorMessage.includes(pattern))

      if (attempt < maxRetries && isRetryable) {
        log.warn({ attempt, maxRetries, error: error.message, retryIn: retryDelay }, "build failed with retryable error, retrying...")
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      } else {
        break
      }
    }
  }

  throw lastError!
}

/**
 * Cleans up build artifacts
 */
async function cleanupBuildArtifacts(workDir: string): Promise<void> {
  const artifactsToClean = ["parts", "stage", "prime"]

  for (const artifact of artifactsToClean) {
    const artifactPath = path.join(workDir, artifact)
    try {
      await remove(artifactPath)
      log.debug({ artifact }, "cleaned build artifact")
    } catch (e: any) {
      log.debug({ artifact, error: e.message }, "no build artifact to clean")
    }
  }

  try {
    const files = await readdir(workDir)
    for (const file of files) {
      if (file.endsWith(".snap")) {
        await remove(path.join(workDir, file))
        log.debug({ file }, "cleaned snap file")
      }
    }
  } catch (e: any) {
    log.debug({ error: e.message }, "no snap files to clean")
  }
}

async function copySnapToArtifactPath(workDir: string, outputBasename: string, outputFileName: string): Promise<string> {
  const snapInWorkDir = path.join(workDir, outputBasename)
  if (snapInWorkDir !== outputFileName) {
    await ensureDir(path.dirname(outputFileName))
    await copyFile(snapInWorkDir, outputFileName)
    log.debug({ from: snapInWorkDir, to: outputFileName }, "copied snap from build dir to artifact path")
  }
  return outputFileName
}

/**
 * Builds a snap package from SnapcraftYAML configuration.
 *
 * `SNAPCRAFT_NO_NETWORK` is intentionally **not** forced to `"1"` here.
 * All build modes (destructive-mode, LXD, Multipass, remote) require network
 * access to download stage-packages, the base image, and extensions.
 * To opt into an offline build, set `SNAPCRAFT_NO_NETWORK=1` in your environment.
 */
export async function buildSnap(options: BuildSnapOptions): Promise<string> {
  const { SNAPCRAFT_NO_NETWORK } = process.env
  const { snapcraftConfig, artifactPath, remoteBuild, stageDir, useLXD = false, useMultipass = false, useDestructiveMode = false } = options

  const env: Record<string, string> = {
    ...(SNAPCRAFT_NO_NETWORK != null ? { SNAPCRAFT_NO_NETWORK } : {}),
  }
  if (useDestructiveMode) {
    env.SNAPCRAFT_BUILD_ENVIRONMENT = "host"
  }

  if (useLXD && process.platform !== "linux") {
    throw new InvalidConfigurationError(`useLXD is only supported on Linux. On ${process.platform}, use useMultipass or remoteBuild instead.`)
  }
  if (useDestructiveMode && process.platform !== "linux") {
    throw new InvalidConfigurationError(
      `useDestructiveMode is only supported on Linux (requires Ubuntu 24.04 host for core24). On ${process.platform}, use useMultipass or remoteBuild instead.`
    )
  }

  // Config validation — throws InvalidConfigurationError, no build artifacts exist yet.
  validateSnapcraftConfig(snapcraftConfig)

  try {
    await validateSnapcraftYamlWithCLI(stageDir)
  } catch (validationError: any) {
    log.warn({ error: validationError.message }, "snapcraft CLI pre-validation failed (non-fatal), continuing build")
  }

  await ensureSnapcraftInstalled()

  if (remoteBuild?.enabled) {
    const authEnv = await ensureRemoteBuildAuthentication(remoteBuild)
    Object.assign(env, authEnv)
  }

  const projectAppDir = path.join(stageDir, "app")
  if (!(await pathExists(projectAppDir))) {
    throw new InvalidConfigurationError(`snap build failed: expected app directory not found at ${projectAppDir}`)
  }
  log.debug({ appFiles: (await readdir(projectAppDir)).slice(0, 20) }, "app directory contents (truncated)")

  if (!remoteBuild?.enabled && !useLXD && !useMultipass && !useDestructiveMode && process.platform !== "linux") {
    throw new InvalidConfigurationError(
      `No snap build environment specified for ${process.platform}. Set one of: useMultipass, useLXD (Linux only), useDestructiveMode (Linux only), or remoteBuild.enabled`
    )
  }

  // Actual build — only this step can leave partial artifacts that need cleanup.
  try {
    return await executeWithRetry(
      () =>
        executeSnapcraftBuild({
          workDir: stageDir,
          remoteBuild,
          outputSnap: artifactPath,
          useLXD,
          useMultipass,
          useDestructiveMode,
          env,
        }),
      { maxRetries: remoteBuild?.enabled ? 3 : 1, retryDelay: 10000 }
    )
  } catch (error: any) {
    log.error({ error: error.message }, "snap build failed")
    await cleanupBuildArtifacts(stageDir).catch((cleanupError: any) => {
      log.warn({ error: cleanupError.message }, "failed to cleanup build artifacts")
    })
    throw error
  }
}

/**
 * Ensures snapcraft is installed on the system
 */
async function ensureSnapcraftInstalled(): Promise<void> {
  try {
    const { stdout } = await execAsync("snapcraft --version")
    log.info({ version: stdout.trim() }, "snapcraft found")
  } catch (error: any) {
    log.error({ error: error.message }, "snapcraft is not installed")

    const platform = process.platform
    if (platform === "linux") {
      log.error(null, "Install with: sudo snap install snapcraft --classic")
    } else if (platform === "darwin") {
      log.error(null, "Install snapcraft with: pip3 install snapcraft")
      log.error(null, "On macOS, useMultipass or remoteBuild are the only supported build modes for core24")
    } else if (platform === "win32") {
      log.error(null, "Install snapcraft via WSL2 or use remote-build")
      log.error(null, "See: https://snapcraft.io/docs/snapcraft-overview")
    }

    throw new InvalidConfigurationError("snapcraft not found - please install snapcraft to continue")
  }
}

/**
 * Resolves Snapcraft Store authentication and returns the credential env entries
 * to inject into the snapcraft subprocess. Returns an empty map when snapcraft
 * can authenticate itself (native env var or interactive session).
 */
async function ensureRemoteBuildAuthentication(remoteBuild: RemoteBuildOptions): Promise<Record<string, string>> {
  log.debug(null, "resolving remote build authentication...")

  // 1. remoteBuild.cscLink — config-level credential (base64 or file path).
  // Takes priority over the env var, mirroring Mac/Windows cscLink behaviour.
  if (remoteBuild.cscLink) {
    try {
      const credentials = await importCredentialContent(remoteBuild.cscLink, process.cwd())
      if (!credentials.trim()) {
        throw new InvalidConfigurationError("resolved credentials are empty")
      }
      log.debug(null, "snap store credentials resolved from remoteBuild.cscLink")
      return { SNAPCRAFT_STORE_CREDENTIALS: credentials.trim() }
    } catch (e: any) {
      throw new InvalidConfigurationError(
        `remoteBuild.cscLink is not valid: ${e.message}\n` +
          `Provide a base64-encoded credentials string or a file path.\n` +
          `Generate with: snapcraft export-login - | base64 -w0`
      )
    }
  }

  // 2. SNAP_CSC_LINK env var — CI-friendly alternative (follows WIN_CSC_LINK pattern).
  // Credential is decoded in memory and injected only into the subprocess env.
  const snapCscLink = process.env.SNAP_CSC_LINK
  if (snapCscLink) {
    try {
      const credentials = await importCredentialContent(snapCscLink, process.cwd())
      if (!credentials.trim()) {
        throw new InvalidConfigurationError("resolved credentials are empty")
      }
      log.debug(null, "snap store credentials resolved from SNAP_CSC_LINK")
      return { SNAPCRAFT_STORE_CREDENTIALS: credentials.trim() }
    } catch (e: any) {
      throw new InvalidConfigurationError(
        `SNAP_CSC_LINK is not valid: ${e.message}\n` +
          `Set SNAP_CSC_LINK to a base64-encoded credentials string or a file path.\n` +
          `Generate with: snapcraft export-login - | base64 -w0`
      )
    }
  }

  // 3. SNAPCRAFT_STORE_CREDENTIALS already in process.env — snapcraft reads it natively.
  if (process.env.SNAPCRAFT_STORE_CREDENTIALS) {
    log.debug(null, "using SNAPCRAFT_STORE_CREDENTIALS from environment, verbatim")
    return {}
  }

  // 4. Interactive snapcraft session.
  try {
    const { stdout } = await execAsync("snapcraft whoami")
    if (stdout.includes("email:")) {
      log.debug({ account: stdout.trim() }, "already authenticated with snapcraft")
      return {}
    }
  } catch {
    // Not logged in, fall through to error.
  }

  throw new InvalidConfigurationError(
    "Snapcraft authentication required for remote build.\n" +
      "Authenticate with one of:\n" +
      "  1. Set SNAP_CSC_LINK: snapcraft export-login - | base64 -w0\n" +
      "  2. Set remoteBuild.cscLink in your build config\n" +
      "  3. Run: snapcraft login\n" +
      "  4. Set SNAPCRAFT_STORE_CREDENTIALS environment variable directly"
  )
}

interface ExecuteSnapcraftOptions {
  workDir: string
  outputSnap: string
  remoteBuild?: RemoteBuildOptions
  useLXD: boolean
  useMultipass: boolean
  useDestructiveMode: boolean
  env: Record<string, string>
}

/**
 * Executes the snapcraft build command
 */
async function executeSnapcraftBuild(options: ExecuteSnapcraftOptions): Promise<string> {
  const { workDir, outputSnap: outputFileName, remoteBuild, useLXD, useMultipass, useDestructiveMode, env } = options

  const outputBasename = path.basename(outputFileName)

  if (useDestructiveMode && !remoteBuild?.enabled) {
    // Snapcraft 8 (craft-application) hangs after a successful destructive-mode
    // build in containerised environments (Docker/CI without snapd running).
    // craft-application's PackageService teardown tries to reach
    // /run/snapd-snap.socket (snapctl IPC) which doesn't exist without a live
    // snapd daemon — causing an indefinite block.
    //
    // Work-around: split into two steps:
    //   1. `snapcraft prime --destructive-mode`  — runs pull/build/stage/prime,
    //      exits cleanly (no post-pack teardown executed).
    //   2. `snapcraft pack <primeDir>`  — packs the pre-primed directory without
    //      running the full build lifecycle, avoiding the problematic teardown.
    const primeArgs = ["prime", "--destructive-mode"]
    if (log.isDebugEnabled) {
      primeArgs.push("--verbose")
    }
    log.info({ command: `snapcraft ${primeArgs.join(" ")}`, workDir: log.filePath(workDir) }, "snapcraft prime (1/2)")
    await spawn("snapcraft", primeArgs, {
      cwd: workDir,
      env: { ...process.env, ...env },
      stdio: "inherit",
    })

    const primeDir = path.join(workDir, "prime")
    const snapcraftPackArgs = ["pack", "--output", outputBasename, primeDir]
    if (log.isDebugEnabled) {
      snapcraftPackArgs.push("--verbose")
    }
    log.info({ command: `snapcraft ${snapcraftPackArgs.join(" ")}`, workDir: log.filePath(workDir) }, "snapcraft pack prime dir (2/2)")
    await spawn("snapcraft", snapcraftPackArgs, {
      cwd: workDir,
      env: { ...process.env, ...env },
      stdio: "inherit",
    })

    return copySnapToArtifactPath(workDir, outputBasename, outputFileName)
  }

  const command = "snapcraft"
  const args: string[] = []

  if (remoteBuild?.enabled) {
    // Remote build on Launchpad (works from any platform)
    args.push("remote-build")
    log.debug(null, "using remote-build (Launchpad)")

    // Add remote build specific options
    if (remoteBuild.launchpadUsername) {
      args.push("--user", remoteBuild.launchpadUsername)
    }

    if (remoteBuild.acceptPublicUpload) {
      args.push("--launchpad-accept-public-upload")
    } else {
      log.warn(null, "your project will be publicly uploaded to Launchpad. Use `acceptPublicUpload: true` to suppress this warning")
    }

    if (remoteBuild.privateProject) {
      args.push("--project", remoteBuild.privateProject)
      log.debug({ project: remoteBuild.privateProject }, "using private Launchpad project")
    }

    if (remoteBuild.buildFor) {
      args.push("--build-for", remoteBuild.buildFor)
      log.debug({ arch: remoteBuild.buildFor }, "building for architecture")
    }

    if (remoteBuild.recover) {
      args.push("--recover")
      log.debug(null, "recovering previous build")
    }

    if (remoteBuild.strategy) {
      env["SNAPCRAFT_REMOTE_BUILD_STRATEGY"] = remoteBuild.strategy
    }

    if (remoteBuild.timeout) {
      args.push("--timeout", String(remoteBuild.timeout))
      log.debug({ timeout: `${remoteBuild.timeout}s` }, "build timeout configured")
    }

    // Remote-build downloads the finished snap into workDir.
    // --output-dir (not --output <file>) lets snapcraft name the file itself.
    args.push("--output-dir", workDir)
    if (log.isDebugEnabled) {
      args.push("--verbose")
    }
  } else {
    // `snapcraft pack` runs the full lifecycle (pull → build → stage → prime → pack).
    // snapcraft 8.x removed --use-multipass entirely; Multipass is now configured
    // via the SNAPCRAFT_BUILD_ENVIRONMENT env var (or auto-selected on macOS).
    // --use-lxd remains a supported CLI flag on `pack`.
    args.push("pack")
    if (useLXD) {
      args.push("--use-lxd")
      log.debug(null, "using LXD for build")
    } else if (useMultipass) {
      env["SNAPCRAFT_BUILD_ENVIRONMENT"] = "multipass"
      log.debug(null, "using Multipass for build (via SNAPCRAFT_BUILD_ENVIRONMENT)")
    }
    if (log.isDebugEnabled) {
      args.push("--verbose")
    }
  }

  log.info({ command: `${command} ${args.join(" ")}`, workDir: log.filePath(workDir) }, "executing snapcraft")

  await spawn(command, args, {
    cwd: workDir,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })

  if (remoteBuild?.enabled || useLXD || useMultipass) {
    // snapcraft names the output snap itself (e.g. <name>_<version>_<arch>.snap).
    // Each electron-builder build invocation targets exactly one arch, so exactly one snap is expected.
    const files = await readdir(workDir)
    const snaps = files.filter(f => f.endsWith(".snap"))
    const builtSnap = snaps[0]
    if (!builtSnap) {
      throw new Error(`Build succeeded but no .snap file found in ${workDir}`)
    }
    return copySnapToArtifactPath(workDir, builtSnap, outputFileName)
  }

  return copySnapToArtifactPath(workDir, outputBasename, outputFileName)
}
