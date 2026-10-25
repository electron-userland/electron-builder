import { exec, Executables, InvalidConfigurationError, log } from "builder-util"
import { cp, mkdir, realpath, symlink, writeFile } from "fs/promises"
import * as path from "path"
import * as semver from "semver"
import { BUILD_CHANGES_URL } from "../../util/config/legacyOptions.js"

// flatpak-builder 1.2.2 is the one of Ubuntu 22.04, the oldest current distribution release (Debian 12 and RHEL 8/9 have 1.2.3). It fixes
// CVE-2022-21682 with an option that flatpak supports from 1.12.4 on; Ubuntu 22.04 has flatpak 1.12.7
const MIN_VERSIONS = { flatpak: "1.12.4", "flatpak-builder": "1.2.2" }

// the freedesktop SDK 24.08 and newer recommend it for meson and cmake modules
const MODULES_FLATPAK_BUILDER_VERSION = "1.4.4"
const MODULES_FREEDESKTOP_SDK_VERSION = "24.8.0"

const NEW_IN_V27 = `This is new in electron-builder v27. See ${BUILD_CHANGES_URL}#flatpak-tooling-requirements`

const FLATPAK_DOCS = "https://www.electron.build/docs/flatpak"
const UNPRIVILEGED_CONTAINERS_DOCS = `${FLATPAK_DOCS}#building-in-unprivileged-containers`

/** The part of a [flatpak-builder manifest](https://docs.flatpak.org/en/latest/flatpak-builder-command-reference.html#flatpak-manifest) that the flatpak target writes. */
export interface FlatpakBuilderManifest {
  id: string
  command: string
  runtime: string
  "runtime-version": string
  sdk: string
  base: string
  "base-version": string
  "finish-args": string[]
  branch?: string
  modules?: (string | any)[]
}

/** The refs a build needs: the runtime, the SDK and the base app of the manifest. */
export type FlatpakRefKind = "runtime" | "sdk" | "base"

export interface FlatpakBundleOptions {
  manifest: FlatpakBuilderManifest
  /** flatpak's name for the target architecture, e.g. `x86_64` */
  arch: string
  /** where to write the single-file bundle */
  artifactPath: string
  /** an empty directory for the manifest, the app directory, the repository and the state of flatpak-builder */
  tempDir: string
  /** `[source, destination]` pairs, copied in order; a destination is relative to the app prefix (`/app` in the sandbox) */
  files: [string, string][]
  /** `[target, link]` pairs, both relative to the app prefix */
  symlinks: [string, string][]
  /** the refs to install when they are missing and update when they are installed; the others are used as installed, and have to be */
  installOrUpdateRefs: ReadonlyArray<FlatpakRefKind>
  /** added to both runs of flatpak-builder */
  flatpakBuilderArgs: string[]
  buildExportArgs: string[]
  buildBundleArgs: string[]
}

/** The absolute paths of the tools, which are never looked up on PATH. */
interface FlatpakTools {
  flatpak: string
  "flatpak-builder": string
}

/**
 * Logs how to fix a failure that has a known cause, given as `[marker, hint]` pairs: the hint of the first marker that the error
 * contains. The error is rethrown as is: `exec` has already put the output of the tool in it.
 */
function hintOn(...hints: Array<[marker: string, hint: string]>) {
  return (e: Error): never => {
    const hint = hints.find(([marker]) => e.message.includes(marker))
    if (hint != null) {
      log.error(null, hint[1])
    }
    throw e
  }
}

/** Checks that the tool runs and is new enough, and returns its version, or null when the output has none. */
async function requireTool(tools: FlatpakTools, tool: keyof typeof MIN_VERSIONS, cwd: string): Promise<semver.SemVer | null> {
  let stdout: string
  try {
    stdout = await exec(tools[tool], ["--version"], { cwd })
  } catch (e: any) {
    log.error({ error: e.message }, `cannot run ${tool}`)
    throw new InvalidConfigurationError(`cannot run ${tool} - flatpak and flatpak-builder must be installed to build the flatpak target`)
  }
  log.info({ version: stdout.trim() }, `${tool} found`)

  // the output is "Flatpak 1.16.6", "flatpak-builder 1.2.3" or "flatpak-builder-1.4.4" depending on the tool and the distribution
  const version = semver.coerce(stdout)
  if (version != null && semver.lt(version, MIN_VERSIONS[tool])) {
    throw new InvalidConfigurationError(
      `${tool} ${version.version} is not supported - version ${MIN_VERSIONS[tool]} or newer is required to build the flatpak target. ${NEW_IN_V27}`
    )
  }
  return version
}

function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/**
 * Where a path given relative to the app prefix lands in the build directory. One that leaves the prefix is refused: the copy or
 * the link would be written elsewhere on the build machine, such as over the metadata of the build directory.
 */
function inAppPrefix(prefix: string, relativePath: string, what: string): string {
  const resolved = path.join(prefix, relativePath)
  if (!isInside(prefix, resolved)) {
    throw new InvalidConfigurationError(`${what} "${relativePath}" is outside the app prefix (/app in the sandbox): use a path inside it, such as "/lib/<name>". ${NEW_IN_V27}`)
  }
  return resolved
}

/**
 * Refuses to write `file` when a symlink takes its directory out of the app prefix, which inAppPrefix cannot see: the base app, the
 * modules and an earlier flatpak.files pair put files into the prefix that are not checked, and a link among them, such as
 * `lib -> ../..` or `lib -> /home`, would make the copy or the link land elsewhere on the build machine. Only the directory is
 * resolved: what is at `file` itself is replaced, not followed, by both cp and symlink.
 */
async function requireDirectoryInAppPrefix(prefix: string, realPrefix: string, file: string, what: string): Promise<void> {
  const relative = path.relative(prefix, file)
  if (relative === "") {
    // the prefix itself, which a directory is merged into
    return
  }
  // the deepest directory that exists, since what is still to be created cannot be a link. A link that leads nowhere is passed over
  // as well: mkdir and cp fail on it rather than create anything through it
  let existing = path.dirname(file)
  let resolved: string | null = null
  while (resolved == null) {
    try {
      resolved = await realpath(existing)
    } catch (e: any) {
      // ENOTDIR: a file of an earlier pair is in the way, which the copy or mkdir reports itself
      if ((e.code !== "ENOENT" && e.code !== "ENOTDIR") || existing === path.dirname(existing)) {
        throw e
      }
      existing = path.dirname(existing)
    }
  }
  if (!isInside(realPrefix, resolved)) {
    const shown = `/${relative.split(path.sep).join("/")}`
    throw new InvalidConfigurationError(
      `${what} "${shown}" resolves outside the app prefix (/app in the sandbox) through a symlink, to "${resolved}": a link in the prefix, from the base app, a module or an earlier flatpak.files pair, points outside it. ${NEW_IN_V27}`
    )
  }
}

/** Whether a ref is installed for the user and system-wide. */
async function findRef(flatpak: string, ref: string, cwd: string): Promise<{ inUser: boolean; inSystem: boolean }> {
  const isInstalled = (installation: "--user" | "--system") =>
    exec(flatpak, ["info", "--show-commit", installation, ref], { cwd }).then(
      () => true,
      () => false
    )
  const [inUser, inSystem] = await Promise.all([isInstalled("--user"), isInstalled("--system")])
  return { inUser, inSystem }
}

/** Brings a ref that the build needs up to date, wherever it is installed, and installs it for the user when it is installed nowhere. */
async function installOrUpdateRef(flatpak: string, ref: string, cwd: string): Promise<void> {
  const { inUser, inSystem } = await findRef(flatpak, ref, cwd)

  if (inUser || inSystem) {
    await exec(flatpak, ["update", ...(inUser ? ["--user"] : []), "--no-deps", "--noninteractive", ref], { cwd })
    return
  }

  log.info({ ref }, "installing flatpak ref, this can download several gigabytes")
  await exec(flatpak, ["install", "--user", "--no-deps", "--noninteractive", ref], { cwd }).catch(
    hintOn([
      "No remote refs found",
      `missing flatpak refs are installed with "flatpak install --user", which only searches the remotes of the user installation. If flathub is not one of them, add it with: flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo (otherwise check that the configured runtime, sdk and base versions exist)`,
    ])
  )
}

/** Checks that a ref that the build is not to install or update is installed, in either installation. */
async function requireInstalledRef(flatpak: string, kind: FlatpakRefKind, ref: string, cwd: string): Promise<void> {
  const { inUser, inSystem } = await findRef(flatpak, ref, cwd)
  if (!inUser && !inSystem) {
    throw new InvalidConfigurationError(
      `the ${kind} ${ref} is not installed, and flatpak.installOrUpdateRefs does not include "${kind}", so the build does not install it. Install it, for example with: flatpak install --user flathub ${ref} (or add "${kind}" to flatpak.installOrUpdateRefs)`
    )
  }
  log.info({ ref }, "flatpak ref is used as installed, without an update")
}

/**
 * Builds a single-file flatpak bundle out of files that are already built.
 *
 * flatpak-builder runs twice. `--build-only` creates the app directory from the base app (and builds the modules of the
 * manifest, if any) and stops, the files are then placed into the app prefix, and `--finish-only` turns the directory into an
 * app with the permissions of the manifest. Nothing has to run inside the build sandbox to get the files in.
 */
export async function buildFlatpakBundle(options: FlatpakBundleOptions): Promise<void> {
  const { manifest, arch, tempDir: cwd } = options
  const manifestFile = path.join(cwd, "manifest.json")
  const appDir = path.join(cwd, "build")
  const prefix = path.join(appDir, "files")
  const repo = path.join(cwd, "repo")
  const branch = manifest.branch ? [manifest.branch] : []
  // checked before anything is installed or built
  const copies = options.files.map(([source, destination]) => [source, inAppPrefix(prefix, destination, "flatpak.files destination")] as const)
  const links = options.symlinks.map(([target, link]) => [target, inAppPrefix(prefix, link, "flatpak.symlinks link")] as const)

  // by absolute path (toolsets.executables or their default install locations), never looked up on PATH
  const tools: FlatpakTools = {
    flatpak: Executables.resolve("flatpak"),
    "flatpak-builder": Executables.resolve("flatpak-builder"),
  }
  await requireTool(tools, "flatpak", cwd)
  const builderVersion = await requireTool(tools, "flatpak-builder", cwd)
  // a freedesktop SDK before 24.08 is left out; any other SDK is not modelled and warned about. Loose, because the strict coerce rejects
  // the zero-padded minor of "22.08"
  const sdkVersion = manifest.sdk === "org.freedesktop.Sdk" ? semver.coerce(manifest["runtime-version"], { loose: true }) : null
  const isOldFreedesktopSdk = sdkVersion != null && semver.lt(sdkVersion, MODULES_FREEDESKTOP_SDK_VERSION)
  if ((manifest.modules?.length ?? 0) > 0 && builderVersion != null && semver.lt(builderVersion, MODULES_FLATPAK_BUILDER_VERSION) && !isOldFreedesktopSdk) {
    // once per process: every arch is built with the same flatpak-builder
    log
      .once("flatpak-builder-modules-version")
      .warn(
        { flatpakBuilder: builderVersion.version, recommended: MODULES_FLATPAK_BUILDER_VERSION },
        `flatpak.modules are built with flatpak-builder ${builderVersion.version}. The freedesktop SDK 24.08 and newer recommend flatpak-builder ${MODULES_FLATPAK_BUILDER_VERSION} or newer for meson and cmake modules: update it if a module fails to build or does not install where it should`
      )
  }

  // the sdk has the version of the runtime
  const refs: [FlatpakRefKind, string][] = [
    ["runtime", `runtime/${manifest.runtime}/${arch}/${manifest["runtime-version"]}`],
    ["sdk", `runtime/${manifest.sdk}/${arch}/${manifest["runtime-version"]}`],
    ["base", `app/${manifest.base}/${arch}/${manifest["base-version"]}`],
  ]
  // the refs to use as installed are checked first, so that a missing one fails the build before anything is downloaded
  const toInstallOrUpdate = refs.filter(([kind]) => options.installOrUpdateRefs.includes(kind))
  for (const [kind, ref] of refs.filter(it => !toInstallOrUpdate.includes(it))) {
    await requireInstalledRef(tools.flatpak, kind, ref, cwd)
  }
  for (const [, ref] of toInstallOrUpdate) {
    await installOrUpdateRef(tools.flatpak, ref, cwd)
  }

  await writeFile(manifestFile, JSON.stringify(manifest, null, 2))

  // flatpak-builder downloads the sources of the modules, and git or curl may need credentials from the environment for that. Without
  // modules it fetches nothing, so it gets the environment that exec filters for every other command
  const builderEnv = (manifest.modules?.length ?? 0) > 0 ? process.env : undefined
  const runFlatpakBuilder = (stage: "--build-only" | "--finish-only") =>
    exec(tools["flatpak-builder"], ["--arch", arch, stage, ...options.flatpakBuilderArgs, appDir, manifestFile], { cwd, env: builderEnv }).catch(
      hintOn(
        [
          "Failure spawning rofiles-fuse",
          `flatpak-builder could not start rofiles-fuse because FUSE is not available, which is typical in unprivileged containers. Set flatpak.additionalArgs.flatpakBuilder to ["--disable-rofiles-fuse"]. Such containers usually also need flatpak.additionalArgs.buildExport set to ["--disable-sandbox"]. See ${UNPRIVILEGED_CONTAINERS_DOCS}`,
        ],
        // rofiles-fuse started, but could not mount the app directory, so flatpak-builder finds it empty
        [
          `Command '${manifest.command}' not found`,
          `flatpak-builder did not find ${manifest.command}, which electron-builder placed in the app directory, because rofiles-fuse could not mount that directory. It needs the FUSE mount helper on the build machine: fusermount3 from the fuse3 package, or fusermount from the fuse package where rofiles-fuse is built against FUSE 2. Install it, or set flatpak.additionalArgs.flatpakBuilder to ["--disable-rofiles-fuse"]. See ${UNPRIVILEGED_CONTAINERS_DOCS}`,
        ],
        // flatpak-builder before 1.4 composes AppStream metadata with appstream-compose, which the freedesktop SDK 24.08 and newer do
        // not ship; it runs only when the app has a metainfo or appdata file named after its id
        [
          "execvp appstream-compose",
          `flatpak-builder could not compose the AppStream metadata of the app (share/metainfo/${manifest.id}.metainfo.xml or share/appdata/${manifest.id}.appdata.xml, from flatpak.files or a module): it runs appstream-compose, which the freedesktop SDK no longer ships from 24.08 on. flatpak-builder 1.4 and newer use appstreamcli instead: update flatpak-builder, or leave the file out. See ${FLATPAK_DOCS}#build-requirements`,
        ]
      )
    )

  await runFlatpakBuilder("--build-only")

  // flatpak-builder has created it, and the paths that the links in it lead to are compared with the one it resolves to
  const realPrefix = await realpath(prefix)
  // one after another, so that a pair can add to what an earlier one has placed. The filter sees every item of a directory, and the
  // destination itself, before it is written or its parent directory created; a symlink in the copied directory is still kept as it is
  const filter = async (_source: string, file: string) => {
    await requireDirectoryInAppPrefix(prefix, realPrefix, file, "flatpak.files destination")
    return true
  }
  for (const [source, destination] of copies) {
    await cp(source, destination, { recursive: true, verbatimSymlinks: true, filter })
  }
  for (const [target, linkPath] of links) {
    // before mkdir, which would create the missing directories wherever a link leads
    await requireDirectoryInAppPrefix(prefix, realPrefix, linkPath, "flatpak.symlinks link")
    await mkdir(path.dirname(linkPath), { recursive: true })
    // resolved in the sandbox, where the prefix is mounted at /app
    await symlink(path.posix.join("/app", target), linkPath)
  }

  await runFlatpakBuilder("--finish-only")

  await exec(tools.flatpak, ["build-export", "--arch", arch, ...options.buildExportArgs, repo, appDir, ...branch], { cwd }).catch(
    hintOn([
      "bwrap: ",
      `flatpak build-export could not start the sandbox of its icon validator because bubblewrap (bwrap) cannot create namespaces, which is typical in unprivileged containers. Set flatpak.additionalArgs.buildExport to ["--disable-sandbox"]. See ${UNPRIVILEGED_CONTAINERS_DOCS}`,
    ])
  )

  await mkdir(path.dirname(options.artifactPath), { recursive: true })
  await exec(tools.flatpak, ["build-bundle", "--arch", arch, ...options.buildBundleArgs, repo, options.artifactPath, manifest.id, ...branch], { cwd })
}
