import { RemoteBuildOptions } from "app-builder-lib/src/options/SnapOptions"
import { copyDir, log, spawn } from "builder-util"
import { mkdir, writeFile } from "fs-extra"
import * as yaml from "js-yaml"
import * as path from "path"
import { SnapcraftYAML } from "./snapcraft"
import childProcess from "child_process"
import util from "util"

const execAsync = util.promisify(childProcess.exec)

interface BuildSnapOptions {
  /** The snapcraft YAML configuration */
  snapcraftConfig: SnapcraftYAML
  /** The output directory for the template and build artifacts */
  appOutDir: string
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
  /** The output filename for the snap (e.g., 'my-app_1.0.0_amd64.snap') */
  outputFileName: string
}

/**
 * Builds a snap package from SnapcraftYAML configuration
 */
export async function buildSnap(options: BuildSnapOptions): Promise<string> {
  const { snapcraftConfig, remoteBuild, outputFileName, appOutDir, stageDir, useLXD = false, useMultipass = false, useDestructiveMode = false, env = {} } = options

  // // Ensure output directory exists
  // await mkdir(outputDir, { recursive: true })

  // Create snap directory structure
  const snapDir = path.join(stageDir, "snap")
  await mkdir(snapDir, { recursive: true })

  // Write snapcraft.yaml
  const snapcraftYamlPath = path.join(snapDir, "snapcraft.yaml")
  const yamlContent = yaml.dump(snapcraftConfig, {
    indent: 2,
    lineWidth: -1, // No line wrapping
    noRefs: true,
  })
  await writeFile(snapcraftYamlPath, yamlContent, "utf8")
  log.debug(snapcraftConfig, `generated snapcraft.yaml`)

  // Copy source files to output directory if different
  if (path.resolve(stageDir) !== path.resolve(appOutDir)) {
    await copyDir(appOutDir, stageDir, {
      filter: filePath => {
        // Exclude snap directory to avoid conflicts
        return !filePath.includes(path.sep + "snap" + path.sep)
      },
    })
    log.debug({ to: log.filePath(stageDir), from: log.filePath(appOutDir) }, `copied source files`)
  }

  // Detect platform and determine build strategy
  const platform = process.platform
  const isLinux = platform === "linux"
  const isMac = platform === "darwin"
  const isWindows = platform === "win32"
  await ensureSnapcraftInstalled(platform)

  const snapFilePath = await executeSnapcraftBuild({
    workDir: stageDir,
    remoteBuild,
    outputFileName: outputFileName,
    useLXD: useLXD || (isLinux && !useDestructiveMode && !useMultipass),
    useMultipass: useMultipass || isMac || isWindows,
    useDestructiveMode: useDestructiveMode && isLinux,
    env,
  })

  log.debug({ snapFilePath }, `snap built successfully`)
  return snapFilePath
}

/**
 * Ensures snapcraft is installed on the system
 */
async function ensureSnapcraftInstalled(platform: string): Promise<void> {
  try {
    const { stdout } = await execAsync("snapcraft --version")
    log.info({ version: stdout.trim() }, `snapcraft found`)
  } catch (error: any) {
    log.error({ error: error.message }, "snapcraft is not installed")

    if (platform === "linux") {
      log.info(null, "Install with: sudo snap install snapcraft --classic")
    } else if (platform === "darwin") {
      log.error({ install: "brew install snapcraft", setup: "sudo snap install snapcraft --classic" }, "install snapcraft via Homebrew, then set up snapcraft")
    } else if (platform === "win32") {
      log.error(null, "install snapcraft via WSL2 or set up remote-build")
    }

    throw new Error("snapcraft not found - please install snapcraft to continue.")
  }
}

interface ExecuteSnapcraftOptions {
  workDir: string
  outputFileName: string
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
  const { workDir, outputFileName, remoteBuild, useLXD, useMultipass, useDestructiveMode, env } = options

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
      log.warn(null, "⚠ Your project will be publicly uploaded to Launchpad")
      log.warn(null, "  Use acceptPublicUpload: true to suppress this warning")
    }

    if (remoteBuild.privateProject) {
      args.push("--project", remoteBuild.privateProject)
      log.debug(null, `Using private Launchpad project: ${remoteBuild.privateProject}`)
    }

    if (remoteBuild.buildFor && remoteBuild.buildFor.length > 0) {
      args.push("--build-for", remoteBuild.buildFor.join(","))
      log.debug(null, `Building for architectures: ${remoteBuild.buildFor.join(", ")}`)
    }

    if (remoteBuild.recover) {
      args.push("--recover")
      log.debug(null, "recovering previous build")
    }

    if (remoteBuild.strategy) {
      env["SNAPCRAFT_REMOTE_BUILD_STRATEGY"] = remoteBuild.strategy
    }

    if (remoteBuild.timeout) {
      // Note: timeout is handled externally with setTimeout
      log.debug(null, `Build timeout: ${remoteBuild.timeout} seconds`)
    }
  } else if (useDestructiveMode) {
    // Destructive mode (Linux only, builds on host)
    args.push("--destructive-mode")
    log.debug(null, "using destructive mode (building on host)")
  } else if (useLXD) {
    // Use LXD (Linux, fast but requires setup)
    args.push("--use-lxd")
    log.debug(null, "using LXD for build")
  } else if (useMultipass) {
    // Use Multipass (default for macOS/Windows)
    // This is the default, so no flag needed
    log.debug(null, "using Multipass for build")
  }

  args.push("--output", outputFileName)

  await spawn(command, args, {
    cwd: workDir,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })

  const snapFilePath = path.isAbsolute(outputFileName) ? outputFileName : path.join(workDir, outputFileName)
  return snapFilePath
}
