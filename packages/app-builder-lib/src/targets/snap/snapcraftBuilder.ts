import { RemoteBuildOptions } from "app-builder-lib/src/options/SnapOptions"
import { copyDir, log, spawn } from "builder-util"
import { mkdir, writeFile, readFile, access } from "fs-extra"
import * as yaml from "js-yaml"
import * as path from "path"
import * as os from "os"
import { SnapcraftYAML } from "./snapcraft"
import * as childProcess from "child_process"
import * as util from "util"

const execAsync = util.promisify(childProcess.exec)

interface BuildSnapOptions {
  /** The snapcraft YAML configuration */
  snapcraftConfig: SnapcraftYAML
  /** The source files to package */
  stageDir: string
  /** Whether to use remote build (builds on Launchpad) */
  remoteBuild?: RemoteBuildOptions
  /** Whether to use LXD for local builds */
  useLXD?: boolean
  /** Whether to use Multipass for local builds (default on macOS/Windows) */
  useMultipass?: boolean
  /** Whether to use destructive mode (builds directly on host, Linux only) */
  useDestructiveMode?: boolean
  /** Additional environment variables for the build */
  env?: Record<string, string>
  /** The snap output path */
  artifactPath: string
}

/**
 * Progress tracker for snap builds
 */
class SnapBuildProgress {
  private startTime = Date.now()

  logStage(stage: string, message: string, percentage?: number) {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    log.info(
      {
        stage,
        elapsed: `${elapsed}s`,
        percentage: percentage ? `${percentage}%` : undefined,
      },
      message
    )
  }

  complete() {
    const totalTime = Math.floor((Date.now() - this.startTime) / 1000)
    log.info({ totalTime: `${totalTime}s` }, "snap build complete")
  }
}

/**
 * Validates snapcraft.yaml using snapcraft's built-in validation
 * This runs snapcraft expand-extensions which validates without building
 */
async function validateSnapcraftYamlWithCLI(workDir: string): Promise<void> {
  try {
    // Run expand-extensions to validate the YAML
    // This checks syntax, required fields, and expands extensions
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
  if (!config.name) errors.push("name is required")
  if (!config.base) errors.push("base is required")
  if (!config.confinement) errors.push("confinement is required")
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

  // Summary validation
  if (config.summary && config.summary.length > 78) {
    warnings.push(`summary is ${config.summary.length} characters (recommended: 78 or less)`)
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

  // Log results
  if (errors.length > 0) {
    log.error({ errors }, "snapcraft.yaml validation failed")
    throw new Error(`Invalid snapcraft.yaml: ${errors.join(", ")}`)
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
async function cleanupBuildArtifacts(workDir: string, keepArtifacts: boolean = false): Promise<void> {
  const { remove, readdir } = await import("fs-extra")
  const artifactsToClean = ["parts", "stage", "prime"]

  for (const artifact of artifactsToClean) {
    const artifactPath = path.join(workDir, artifact)
    try {
      await remove(artifactPath)
      log.debug({ artifact }, "cleaned build artifact")
    } catch (error) {
      // Ignore errors if artifact doesn't exist
    }
  }

  // Clean snap files if not keeping artifacts
  if (!keepArtifacts) {
    try {
      const files = await readdir(workDir)
      for (const file of files) {
        if (file.endsWith(".snap")) {
          await remove(path.join(workDir, file))
          log.debug({ file }, "cleaned snap file")
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
}

/**
 * Builds a snap package from SnapcraftYAML configuration
 */
export async function buildSnap(options: BuildSnapOptions): Promise<string> {
  const progress = new SnapBuildProgress()
  const { SNAPCRAFT_NO_NETWORK = "1" } = process.env
  const {
    snapcraftConfig,
    artifactPath,
    remoteBuild,
    stageDir,
    useLXD = false,
    useMultipass = false,
    useDestructiveMode = false,
    env: userEnv,
  } = options

  // Build environment: start from user-provided env, ensure network-disabled by default.
  const env: Record<string, string> = {
    ...(userEnv || {}),
    SNAPCRAFT_NO_NETWORK,
  }

  // Only force host (destructive) build environment when destructive mode is explicitly requested.
  if (useDestructiveMode) {
    env.SNAPCRAFT_BUILD_ENVIRONMENT = "host"
  }

  try {
    progress.logStage("preparing", "validating snapcraft configuration", 10)
    validateSnapcraftConfig(snapcraftConfig)

    progress.logStage("preparing", "validating with snapcraft CLI", 35)
    await validateSnapcraftYamlWithCLI(stageDir)

    // Step 5: Detect platform and determine build strategy
    progress.logStage("preparing", "detecting platform and build method", 50)
    const platform = process.platform
    const isLinux = platform === "linux"
    const isMac = platform === "darwin"
    const isWindows = platform === "win32"
    await ensureSnapcraftInstalled(platform)

    // Step 6: Authenticate for remote build
    if (remoteBuild?.enabled) {
      progress.logStage("preparing", "authenticating for remote build", 60)
      await ensureRemoteBuildAuthentication(remoteBuild, env)
    }

    // Step 7: Execute build with retry
    progress.logStage("building", "running snapcraft build", 70)
    const snapFilePath = await executeWithRetry(
      () =>
        executeSnapcraftBuild({
          workDir: stageDir,
          remoteBuild,
          outputSnap: artifactPath,
          useLXD: useLXD, //|| (isLinux && !useDestructiveMode && !useMultipass && !remoteBuild?.enabled),
          useMultipass: useMultipass, //|| ((isMac || isWindows) && !remoteBuild?.enabled),
          useDestructiveMode: useDestructiveMode, //&& isLinux && !remoteBuild?.enabled,
          env,
        }),
      {
        maxRetries: remoteBuild?.enabled ? 3 : 1,
        retryDelay: 10000,
      }
    )

    progress.logStage("complete", "snap built successfully", 100)
    progress.complete()

    log.info({ snapFilePath }, "snap build complete")
    return snapFilePath
  } catch (error: any) {
    log.error({ error: error.message, stack: error.stack }, "snap build failed")

    try {
      await cleanupBuildArtifacts(stageDir, false)
    } catch (cleanupError: any) {
      log.warn({ error: cleanupError.message }, "failed to cleanup build artifacts")
    }

    throw error
  }
}

/**
 * Ensures snapcraft is installed on the system
 */
async function ensureSnapcraftInstalled(platform: string): Promise<void> {
  try {
    const { stdout } = await execAsync("snapcraft --version")
    log.info({ version: stdout.trim() }, "snapcraft found")
  } catch (error: any) {
    log.error({ error: error.message }, "snapcraft is not installed")

    if (platform === "linux") {
      log.error(null, "Install with: sudo snap install snapcraft --classic")
    } else if (platform === "darwin") {
      log.error(null, "Install with: brew install snapcraft")
      log.error(null, "Then setup: sudo snap install snapcraft --classic (if snap is installed)")
    } else if (platform === "win32") {
      log.error(null, "Install snapcraft via WSL2 or use remote-build")
      log.error(null, "See: https://snapcraft.io/docs/snapcraft-overview")
    }

    throw new Error("snapcraft not found - please install snapcraft to continue")
  }
}

/**
 * Ensures remote build authentication is configured
 */
async function ensureRemoteBuildAuthentication(remoteBuild: RemoteBuildOptions, env: Record<string, string>): Promise<void> {
  log.debug(null, "checking remote build authentication...")

  // Check if credentials file exists and is readable
  if (remoteBuild.credentialsFile) {
    try {
      const credentials = await readFile(remoteBuild.credentialsFile, "utf8")

      if (!credentials || credentials.trim().length === 0) {
        throw new Error("Credentials file is empty")
      }

      env["SNAPCRAFT_STORE_CREDENTIALS"] = credentials.trim()
      log.debug(null, "using credentials from file")
      return
    } catch (error: any) {
      log.error({ error: error.message, file: remoteBuild.credentialsFile }, "failed to read credentials file")
      throw new Error(
        `Failed to read credentials file '${remoteBuild.credentialsFile}': ${error.message}\n` + `Generate credentials with: snapcraft export-login ${remoteBuild.credentialsFile}`
      )
    }
  }

  // Check if already authenticated
  try {
    const { stdout } = await execAsync("snapcraft whoami")
    if (stdout.includes("email:")) {
      log.debug({ account: stdout.trim() }, "already authenticated with snapcraft")
      return
    }
  } catch (error) {
    // Not logged in, continue with checks
  }

  // Check for SSH key (required for remote build)
  const sshKeyPath = remoteBuild.sshKeyPath || path.join(os.homedir(), ".ssh", "id_rsa")

  try {
    await access(sshKeyPath)
    log.debug({ sshKeyPath }, "SSH key found")
  } catch (error) {
    const publicKeyPath = `${sshKeyPath}.pub`
    log.error({ sshKeyPath, publicKeyPath }, "SSH key not found - remote build requires SSH authentication")
    throw new Error(
      `SSH key not found at ${sshKeyPath}\n` +
        `To set up remote build:\n` +
        `1. Generate SSH key: ssh-keygen -t rsa -b 4096 -f ${sshKeyPath}\n` +
        `2. Add public key to Launchpad: https://launchpad.net/~/+editsshkeys\n` +
        `3. Login to Snapcraft: snapcraft login`
    )
  }

  // Not authenticated
  log.error(null, "not authenticated with snapcraft")
  throw new Error(
    "Snapcraft authentication required for remote build\n" +
      "Authenticate with one of:\n" +
      "  1. Run: snapcraft login\n" +
      `  2. Export credentials: snapcraft export-login credentials.txt\n` +
      "  3. Set SNAPCRAFT_STORE_CREDENTIALS environment variable"
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

    if (remoteBuild.buildFor && remoteBuild.buildFor.length > 0) {
      args.push("--build-for", remoteBuild.buildFor.join(","))
      log.debug({ archs: remoteBuild.buildFor }, "building for architectures")
    }

    if (remoteBuild.recover) {
      args.push("--recover")
      log.debug(null, "recovering previous build")
    }

    if (remoteBuild.strategy) {
      env["SNAPCRAFT_REMOTE_BUILD_STRATEGY"] = remoteBuild.strategy
    }

    if (remoteBuild.timeout) {
      log.debug({ timeout: `${remoteBuild.timeout}s` }, "build timeout configured")
    }
  } else {
    // Use 'pack' command for local builds (replaces bare 'snapcraft')
    args.push("pack")

    if (useDestructiveMode) {
      // Destructive mode (Linux only, builds on host)
      args.push("--destructive-mode")
      log.debug(null, "using destructive mode (building on host)")
    } else if (useLXD) {
      // Use LXD (Linux, fast but requires setup)
      args.push("--use-lxd")
      log.debug(null, "using LXD for build")
    } else if (useMultipass) {
      // Use Multipass (default for macOS/Windows)
      args.push("--use-multipass")
      log.debug(null, "using Multipass for build")
    }
  }

  args.push("--output", outputFileName)
  if (log.isDebugEnabled) {
    args.push("--verbose")
  }

  log.info({ command: `${command} ${args.join(" ")}`, workDir: log.filePath(workDir) }, "executing snapcraft build")

  await spawn(command, args, {
    cwd: workDir,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })

  const snapFilePath = path.isAbsolute(outputFileName) ? outputFileName : path.join(workDir, outputFileName)
  return snapFilePath
}
