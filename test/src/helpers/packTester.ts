import { PublishManager } from "app-builder-lib"
import { readAsar } from "app-builder-lib/out/asar/asar"
import { computeArchToTargetNamesMap } from "app-builder-lib/out/targets/targetFactory"
import { getLinuxToolsPath } from "app-builder-lib/out/toolsets/linux"
import { parsePlistFile, PlistObject } from "app-builder-lib/out/util/plist"
import { AsarIntegrity } from "app-builder-lib/out/asar/integrity"
import { addValue, copyDir, deepAssign, exec, executeFinally, exists, FileCopier, log, USE_HARD_LINKS, walk } from "builder-util"
import { CancellationToken, UpdateFileInfo } from "builder-util-runtime"
import { Arch, ArtifactCreated, Configuration, DIR_TARGET, getArchSuffix, MacOsTargetName, Packager, PackagerOptions, Platform, Target } from "electron-builder"
import { convertVersion } from "electron-winstaller"
import { PublishPolicy } from "electron-publish"
import { copyFile, emptyDir, mkdir, writeJson } from "fs-extra"
import * as fs from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import pathSorter from "path-sort"
import { NtExecutable, NtExecutableResource } from "resedit"
import { TmpDir } from "temp-file"
import { getCollectorByPackageManager, PM } from "app-builder-lib/out/node-module-collector"
import { promisify } from "util"
import { MAC_CSC_LINK, WIN_CSC_LINK } from "./codeSignData"
import { assertThat } from "./fileAssert"
import AdmZip from "adm-zip"
// @ts-ignore
import sanitizeFileName from "sanitize-filename"
import type { ExpectStatic } from "vitest"
import { computeDefaultAppDirectory } from "app-builder-lib/out/util/config/config"
import { installDependencies } from "app-builder-lib/out/util/yarn"
import { ELECTRON_VERSION } from "./testConfig"
import { createLazyProductionDeps } from "app-builder-lib/out/util/packageDependencies"
import { execSync } from "child_process"
import { detectPackageManager } from "app-builder-lib/out/node-module-collector/packageManager"

const PACKAGE_MANAGER_VERSION_MAP = {
  [PM.NPM]: { cli: "npm", version: "9.8.1" },
  [PM.YARN]: { cli: "yarn", version: "1.22.19" },
  [PM.YARN_BERRY]: { cli: "yarn", version: "3.5.0" },
  [PM.PNPM]: { cli: "pnpm", version: "10.18.0" },
  [PM.BUN]: { cli: "bun", version: "1.3.2" },
  [PM.TRAVERSAL]: { cli: "npm", version: "9.8.1" }, // use npm to install, we're testing manual node traversal, but we still need something to install the dependencies
}

export function getPackageManagerWithVersion(pm: PM, packageManagerAndVersionString?: string) {
  const packageManagerInfo = PACKAGE_MANAGER_VERSION_MAP[pm]
  const prepare = packageManagerAndVersionString == null ? `${packageManagerInfo.cli}@${packageManagerInfo.version}` : packageManagerAndVersionString
  return {
    cli: packageManagerInfo.cli,
    version: packageManagerInfo.version,
    prepareEntry: prepare,
  }
}

export const EXTENDED_TIMEOUT = 14 * 60 * 1000
export const linuxDirTarget = Platform.LINUX.createTarget(DIR_TARGET, Arch.x64)
export const snapTarget = Platform.LINUX.createTarget("snap", Arch.x64)

export interface AssertPackOptions {
  readonly projectDirCreated?: (projectDir: string, tmpDir: TmpDir, testEnv: NodeJS.ProcessEnv) => Promise<any> | (() => Promise<any>)
  readonly packed?: (context: PackedContext) => Promise<any>
  readonly expectedArtifacts?: Array<string>

  readonly checkMacApp?: (appDir: string, info: any) => Promise<any>

  readonly packageManager?: PM
  readonly useTempDir?: boolean
  readonly signed?: boolean
  readonly signedWin?: boolean

  readonly storeDepsLockfileSnapshot?: boolean

  readonly publish?: PublishPolicy

  readonly tmpDir?: TmpDir
}

export interface PackedContext {
  readonly projectDir: string
  readonly outDir: string

  readonly getAppPath: (platform: Platform, arch?: Arch) => string
  readonly getResources: (platform: Platform, arch?: Arch) => string
  readonly getContent: (platform: Platform, arch?: Arch) => string

  readonly packager: Packager

  readonly tmpDir: TmpDir
}

export function appThrows(expect: ExpectStatic, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}, customErrorAssert?: (error: Error) => void) {
  return assertThat(expect, assertPack(expect, "test-app-one", packagerOptions, checkOptions)).throws(customErrorAssert)
}

export function appTwoThrows(expect: ExpectStatic, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}, customErrorAssert?: (error: Error) => void) {
  return assertThat(expect, assertPack(expect, "test-app", packagerOptions, checkOptions)).throws(customErrorAssert)
}

export function app(expect: ExpectStatic, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return assertPack(expect, packagerOptions.config != null && (packagerOptions.config as any).protonNodeVersion != null ? "proton" : "test-app-one", packagerOptions, checkOptions)
}

export function appTwo(expect: ExpectStatic, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return assertPack(expect, "test-app", packagerOptions, checkOptions)
}

export async function assertPack(expect: ExpectStatic, fixtureName: string, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}): Promise<void> {
  let configuration = packagerOptions.config as Configuration
  if (configuration == null) {
    configuration = {}
    ;(packagerOptions as any).config = configuration
  }

  if (checkOptions.signed) {
    packagerOptions = signed(packagerOptions)
  }
  if (checkOptions.signedWin) {
    configuration.cscLink = WIN_CSC_LINK
    configuration.cscKeyPassword = ""
  } else if (configuration.cscLink == null) {
    packagerOptions = deepAssign({}, packagerOptions, { config: { mac: { identity: null } } })
  }

  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  const tmpDir = checkOptions.tmpDir || new TmpDir(`pack-tester: ${fixtureName}`)
  // non-macOS test uses the same dir as macOS test, but we cannot share node_modules (because tests executed in parallel)
  const dir = customTmpDir == null ? await tmpDir.createTempDir({ prefix: "test_project" }) : path.resolve(customTmpDir)
  if (customTmpDir != null) {
    await emptyDir(dir)
    log.info({ customTmpDir }, "custom temp dir used")
  }

  const state = expect.getState()
  const lockfileFixtureName = `${path.basename(state.testPath!, ".ts")}`
  const lockfilePathPrefix = path.join(__dirname, "..", "..", "fixtures", "lockfiles", lockfileFixtureName)
  const testFixtureLockfile = path.join(lockfilePathPrefix, `${sanitizeFileName(state.currentTestName!)}.txt`)

  await copyDir(projectDir, dir, {
    filter: it => {
      const basename = path.basename(it)
      // if custom project dir specified, copy node_modules (i.e. do not ignore it)
      return (packagerOptions.projectDir != null || basename !== "node_modules") && (!basename.startsWith(".") || basename === ".babelrc")
    },
    isUseHardLink: USE_HARD_LINKS, // TODO: consider use hard links for tests
  })
  projectDir = dir

  await executeFinally(
    (async () => {
      const packageManagerOverride = checkOptions.packageManager
      await modifyPackageJson(projectDir, data => {
        if (data.packageManager == null || packageManagerOverride) {
          data.packageManager = getPackageManagerWithVersion(packageManagerOverride || PM.NPM).prepareEntry
        }
      })

      const tmpCache = await tmpDir.createTempDir({ prefix: "cache-" })
      const tmpHome = await tmpDir.createTempDir({ prefix: "home-" })
      const runtimeEnv = {
        ...process.env,
        // corepack
        // COREPACK_HOME,
        // COREPACK_ENABLE_DOWNLOADS: "1",
        // yarn
        HOME: tmpHome,
        USERPROFILE: tmpHome, // for Windows compatibility
        YARN_CACHE_FOLDER: tmpCache, // this doesn't seem to always work in concurrent tests? So we must set manually
        // YARN_DISABLE_TELEMETRY: "1",
        // YARN_ENABLE_TELEMETRY: "false",
        YARN_IGNORE_PATH: "1", // ignore globally installed yarn binaries
        YARN_ENABLE_IMMUTABLE_INSTALLS: "false", // to be sure that --frozen-lockfile is not used
        // YARN_NODE_LINKER: "node-modules", // force to not use pnp (as there's no way to access virtual packages within the paths returned by pnpm)
        npm_config_cache: tmpCache, // prevent npm fallback caching
      }
      const postNodeModulesInstallHook = checkOptions.projectDirCreated ? await checkOptions.projectDirCreated(projectDir, tmpDir, runtimeEnv) : null

      // Check again. Package manager could have been changed in package.json during `projectDirCreated`
      const { pm, corepackConfig: packageManager } = await detectPackageManager([projectDir])
      const { cli, prepareEntry, version } = getPackageManagerWithVersion(pm, packageManager)

      if (pm === PM.BUN) {
        log.info({ pm, version: version, projectDir }, "installing dependencies with bun; corepack does not support it currently and it must be installed separately")
      } else {
        log.info({ pm, version: version, projectDir }, "activating corepack")
        try {
          execSync(`corepack enable ${cli}`, { env: runtimeEnv, cwd: projectDir, stdio: "ignore" })
        } catch (err: any) {
          log.warn({ message: err.message }, "⚠️ corepack enable failed (possibly already enabled)")
        }
        try {
          execSync(`corepack prepare ${prepareEntry} --activate`, { env: runtimeEnv, cwd: projectDir, stdio: "ignore" })
        } catch (err: any) {
          log.warn({ message: err.message }, "⚠️ corepack prepare failed")
        }
      }
      const collector = getCollectorByPackageManager(pm, projectDir, tmpDir)
      const collectorOptions = collector.installOptions

      const destLockfile = path.join(projectDir, collectorOptions.lockfile)

      const shouldUpdateLockfiles = !!process.env.UPDATE_LOCKFILE_FIXTURES && !!checkOptions.storeDepsLockfileSnapshot
      // check for lockfile fixture so we can use `--frozen-lockfile`
      if ((await exists(testFixtureLockfile)) && !shouldUpdateLockfiles) {
        await copyFile(testFixtureLockfile, destLockfile)
      }

      if (!(await exists(destLockfile))) {
        log.info({ lockfile: collectorOptions.lockfile }, "lockfile not found, creating empty stub to prevent package manager prompts")
        await fs.writeFile(destLockfile, "")
      }

      const appDir = await computeDefaultAppDirectory(projectDir, configuration.directories?.app)

      await installDependencies(
        configuration,
        {
          projectDir: projectDir,
          appDir: appDir,
          workspaceRoot: null,
        },
        {
          frameworkInfo: { version: ELECTRON_VERSION, useCustomDist: false },
          productionDeps: createLazyProductionDeps(appDir, null, false),
        },
        runtimeEnv
      )

      if (typeof postNodeModulesInstallHook === "function") {
        await postNodeModulesInstallHook()
      }

      // save lockfile fixture
      if (!(await exists(testFixtureLockfile)) && shouldUpdateLockfiles) {
        const fixtureDir = path.dirname(testFixtureLockfile)
        if (!(await exists(fixtureDir))) {
          await mkdir(fixtureDir)
        }
        await copyFile(destLockfile, testFixtureLockfile)
      }

      if (packagerOptions.projectDir != null) {
        packagerOptions.projectDir = path.resolve(projectDir, packagerOptions.projectDir)
      }

      const { packager, outDir } = await packAndCheck(
        expect,
        {
          projectDir,
          ...packagerOptions,
        },
        checkOptions,
        runtimeEnv
      )

      if (checkOptions.packed != null) {
        const getAppPath = function (platform: Platform, arch?: Arch): string {
          return path.join(outDir, `${platform.buildConfigurationKey}${getArchSuffix(arch ?? Arch.x64)}${platform === Platform.MAC ? "" : "-unpacked"}`)
        }
        const getContent = (platform: Platform, arch: Arch | undefined): string => {
          return path.join(getAppPath(platform, arch), platform === Platform.MAC ? `${packager.appInfo.productFilename}.app/Contents` : "")
        }
        const getResources = (platform: Platform, arch: Arch | undefined): string => {
          return path.join(getContent(platform, arch), platform === Platform.MAC ? "Resources" : "resources")
        }
        await checkOptions.packed({
          projectDir,
          outDir,
          getAppPath,
          getResources,
          getContent,
          packager,
          tmpDir,
        })
      }
    })(),
    (): any => (tmpDir === checkOptions.tmpDir ? null : tmpDir.cleanup())
  )
}

const fileCopier = new FileCopier()

export function copyTestAsset(name: string, destination: string): Promise<void> {
  return fileCopier.copy(path.join(getFixtureDir(), name), destination, undefined)
}

export function getFixtureDir() {
  return path.join(__dirname, "..", "..", "fixtures")
}

/**
 * Determines the priority of a file based on its extension for sorting.
 * Lower numbers have higher priority in the sort order.
 */
function getFileTypePriority(file: string): number {
  const ordering = [
    // Primary executables and installers
    ".dmg",
    ".exe",
    ".msi",
    ".pkg",
    ".deb",
    ".rpm",
    ".AppImage",
    ".appx",
    ".snap",
    ".flatpak",

    // Archive formats
    ".zip",
    ".7z",
    ".tar.gz",
    ".tar.xz",
    ".tar.bz2",

    // Package formats
    ".nupkg",
    ".asar",

    // Metadata and auxiliary files
    ".blockmap",
    ".yml",
    ".yaml",
  ]

  const index = ordering.findIndex(ext => file.endsWith(ext))
  // If found, return the index (0-based), otherwise return highest value for "other files"
  return index === -1 ? ordering.length : index
}

/**
 * Sorts artifacts in a deterministic order for consistent test snapshots.
 * Sort order:
 * 1. Primary: File type (by extension priority)
 * 2. Secondary: Architecture (ia32 < x64 < armv7l < arm64 < universal)
 * 3. Tertiary: Filename (alphabetical)
 * 4. Quaternary: Presence of updateInfo (with updateInfo < without updateInfo)
 * 5. Quinary: Safe artifact name (alphabetical)
 */
function sortArtifacts(a: ArtifactCreated, b: ArtifactCreated): number {
  // Primary sort: by file extension type
  const fileA = a.file ?? ""
  const fileB = b.file ?? ""

  const typePriorityA = getFileTypePriority(fileA)
  const typePriorityB = getFileTypePriority(fileB)

  if (typePriorityA !== typePriorityB) {
    return typePriorityA - typePriorityB
  }

  // Secondary sort: by architecture
  const archSortKey = (a.arch?.valueOf() ?? 0) - (b.arch?.valueOf() ?? 0)
  if (archSortKey !== 0) {
    return archSortKey
  }

  // Tertiary sort: by filename
  const baseNameA = path.basename(fileA)
  const baseNameB = path.basename(fileB)
  const fileNameCompare = baseNameA.localeCompare(baseNameB, "en")
  if (fileNameCompare !== 0) {
    return fileNameCompare
  }

  // Quaternary sort: by presence of updateInfo (with updateInfo comes first)
  const hasUpdateInfoA = a.updateInfo ? 0 : 1
  const hasUpdateInfoB = b.updateInfo ? 0 : 1

  if (hasUpdateInfoA !== hasUpdateInfoB) {
    return hasUpdateInfoA - hasUpdateInfoB
  }

  // Quinary sort: by safeArtifactName (final tiebreaker)
  const safeNameA = a.safeArtifactName ?? ""
  const safeNameB = b.safeArtifactName ?? ""

  return safeNameA.localeCompare(safeNameB, "en")
}

async function packAndCheck(
  expect: ExpectStatic,
  packagerOptions: PackagerOptions,
  checkOptions: AssertPackOptions,
  runtimeEnv: NodeJS.ProcessEnv
): Promise<{ packager: Packager; outDir: string }> {
  const cancellationToken = new CancellationToken()
  const packager = new Packager(packagerOptions, cancellationToken)
  ;(packager as any).runtimeEnvironmentVariables = runtimeEnv
  const publishManager = new PublishManager(packager, { publish: "publish" in checkOptions ? checkOptions.publish : "never" })

  const artifacts: Map<Platform, Array<ArtifactCreated>> = new Map()
  packager.onArtifactCreated(event => {
    if (event.file == null) {
      return
    }

    assertThat(expect, event.file).isAbsolute()
    addValue(artifacts, event.packager.platform, event)
  })

  const { outDir, platformToTargets } = await packager.build()
  await publishManager.awaitTasks()

  if (packagerOptions.platformPackagerFactory != null) {
    return { packager, outDir }
  }

  const objectToCompare: any = {}
  for (const platform of packagerOptions.targets!.keys()) {
    objectToCompare[platform.buildConfigurationKey] = await Promise.all(
      (artifacts.get(platform) || []).sort(sortArtifacts).map(async it => {
        const result: any = { ...it }
        const file = result.file
        if (file != null) {
          if (file.endsWith(".yml")) {
            result.fileContent = removeUnstableProperties(load(await fs.readFile(file, "utf-8")))
          }
          result.file = path.basename(file)
        }
        const updateInfo = result.updateInfo
        if (updateInfo != null) {
          result.updateInfo = removeUnstableProperties(updateInfo)
        }
        if (updateInfo == null) {
          delete result.updateInfo
        }

        // reduce snapshot - avoid noise
        if (result.safeArtifactName == null) {
          delete result.safeArtifactName
        }
        if (result.arch == null) {
          delete result.arch
        } else {
          result.arch = Arch[result.arch]
        }

        if (result.fileContent) {
          if (Buffer.isBuffer(result.fileContent)) {
            delete result.fileContent
          } else if (Array.isArray(result.fileContent.files)) {
            result.fileContent.files = result.fileContent.files.sort((a: UpdateFileInfo, b: UpdateFileInfo) => a.url.localeCompare(b.url, "en"))
          }
        }

        delete result.isWriteUpdateInfo
        delete result.packager
        delete result.target
        delete result.publishConfig
        return result
      })
    )
  }

  expect(objectToCompare).toMatchSnapshot()

  c: for (const [platform, archToType] of packagerOptions.targets!) {
    for (const [arch, targets] of computeArchToTargetNamesMap(
      archToType,
      { platformSpecificBuildOptions: (packagerOptions as any)[platform.buildConfigurationKey] || {}, defaultTarget: [] } as any,
      platform
    )) {
      if (targets.length === 1 && targets[0] === DIR_TARGET) {
        continue c
      }

      const nameToTarget = platformToTargets.get(platform)!
      if (platform === Platform.MAC) {
        const subDir = nameToTarget.has("mas-dev") ? "mas-dev" : nameToTarget.has("mas") ? "mas" : "mac"
        const packedAppDir = path.join(outDir, `${subDir}${getArchSuffix(arch)}`, `${packager.appInfo.productFilename}.app`)
        await checkMacResult(expect, packager, packagerOptions, checkOptions, packedAppDir)
      } else if (platform === Platform.LINUX) {
        await checkLinuxResult(expect, outDir, packager, arch, nameToTarget)
      } else if (platform === Platform.WINDOWS) {
        await checkWindowsResult(expect, packager, checkOptions, artifacts.get(platform)!, nameToTarget)
      }
    }
  }

  return { packager, outDir }
}

async function checkLinuxResult(expect: ExpectStatic, outDir: string, packager: Packager, arch: Arch, nameToTarget: Map<string, Target>) {
  if (!nameToTarget.has("deb")) {
    return
  }

  const appInfo = packager.appInfo
  const autoFindPackagePath = await fs.readdir(outDir).then(files => files.find(file => file.endsWith(".deb")))
  const defaultPackageFile = `${outDir}/${appInfo.name}_${appInfo.version}_${arch === Arch.ia32 ? "i386" : arch === Arch.x64 ? "amd64" : "armv7l"}.deb`
  const packagePath = autoFindPackagePath != null ? path.join(outDir, autoFindPackagePath) : defaultPackageFile
  expect(await getContents(packagePath)).toMatchSnapshot()
  if (arch === Arch.ia32) {
    expect(await getContents(`${outDir}/${appInfo.name}_${appInfo.version}_i386.deb`)).toMatchSnapshot()
  }

  const control = parseDebControl(
    (
      await execShell(`ar p '${packagePath}' control.tar.xz | ${await getTarExecutable()} -Jx --to-stdout ./control`, {
        maxBuffer: 10 * 1024 * 1024,
      })
    ).stdout
  )

  delete control.Version
  delete control.Size
  const description = control.Description
  delete control.Description
  expect(control).toMatchSnapshot()
  // strange difference on linux and mac (no leading space on Linux)
  expect(description.trim()).toMatchSnapshot()
}

function parseDebControl(info: string): any {
  const regexp = /([\w]+): *(.+\n)([^:\n]+\n)?/g
  let match: Array<string> | null
  const metadata: any = {}
  info = info.substring(info.indexOf("Package:"))
  while ((match = regexp.exec(info)) !== null) {
    let value = match[2]
    if (match[3] != null) {
      value += match[3]
    }

    if (value[value.length - 1] === "\n") {
      value = value.substring(0, value.length - 1)
    }
    metadata[match[1]] = value
  }
  return metadata
}

async function checkMacResult(expect: ExpectStatic, packager: Packager, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions, packedAppDir: string) {
  const appInfo = packager.appInfo
  const plistPath = path.join(packedAppDir, "Contents", "Info.plist")
  const info = await parsePlistFile<PlistObject>(plistPath)

  const buildNumber = process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM
  expect(info).toMatchObject({
    CFBundleVersion: info.CFBundleVersion === "50" ? "50" : `${appInfo.version}${buildNumber ? "." + buildNumber : ""}`,
  })

  // checked manually, remove to avoid mismatch on CI server (where TRAVIS_BUILD_NUMBER is defined and different on each test run)
  delete info.CFBundleVersion
  delete info.BuildMachineOSBuild
  delete info.NSHumanReadableCopyright
  delete info.DTXcode
  delete info.DTXcodeBuild
  delete info.DTSDKBuild
  delete info.DTSDKName
  delete info.DTCompiler
  delete info.ElectronTeamID
  delete info.NSMainNibFile
  delete info.NSCameraUsageDescription
  delete info.NSMicrophoneUsageDescription
  delete info.NSRequiresAquaSystemAppearance
  delete info.NSQuitAlwaysKeepsWindows
  if (info.NSAppTransportSecurity != null) {
    delete (info.NSAppTransportSecurity as PlistObject).NSAllowsArbitraryLoads
  }
  // test value
  if (info.LSMinimumSystemVersion !== "10.12.0") {
    delete info.LSMinimumSystemVersion
  }

  const { ElectronAsarIntegrity: checksumData, ...snapshot } = info

  if (checksumData != null) {
    for (const name of Object.keys(checksumData)) {
      ;(checksumData as Record<string, any>)[name] = { algorithm: "SHA256", hash: "hash" }
    }
    snapshot.ElectronAsarIntegrity = checksumData
  }
  expect(snapshot).toMatchSnapshot()

  if (checkOptions.checkMacApp != null) {
    await checkOptions.checkMacApp(packedAppDir, snapshot)
  }

  if (packagerOptions.config != null && (packagerOptions.config as Configuration).cscLink != null) {
    const result = await exec("codesign", ["--verify", packedAppDir])
    expect(result).not.toMatch(/is not signed at all/)
  }
}

async function checkWindowsResult(expect: ExpectStatic, packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, nameToTarget: Map<string, Target>) {
  function checkSquirrelResult() {
    const appInfo = packager.appInfo
    const { zip } = checkResult(expect, artifacts, "-full.nupkg")

    if (checkOptions == null) {
      const expectedSpec = zip.readAsText("TestApp.nuspec").replace(/\r\n/g, "\n")
      // console.log(expectedSpec)
      expect(expectedSpec).toEqual(`<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>TestApp</id>
    <version>${convertVersion(appInfo.version)}</version>
    <title>${appInfo.productName}</title>
    <authors>Foo Bar</authors>
    <owners>Foo Bar</owners>
    <iconUrl>https://raw.githubusercontent.com/szwacz/electron-boilerplate/master/resources/windows/icon.ico</iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>Test Application (test quite “ #378)</description>
    <copyright>Copyright © ${new Date().getFullYear()} Foo Bar</copyright>
    <projectUrl>http://foo.example.com</projectUrl>
  </metadata>
</package>`)
    }
  }

  async function checkZipResult() {
    const { packageFile, zip, allFiles } = checkResult(expect, artifacts, ".zip")

    const executable = allFiles.filter(it => it.endsWith(".exe"))[0]
    zip.extractEntryTo(executable, path.dirname(packageFile), true, true)
    const buffer = await fs.readFile(path.join(path.dirname(packageFile), executable))
    const resource = NtExecutableResource.from(NtExecutable.from(buffer))
    const integrityBuffer = resource.entries.find(entry => entry.type === "INTEGRITY")
    const asarIntegrity = new Uint8Array(integrityBuffer!.bin)
    const decoder = new TextDecoder("utf-8")
    const checksumData = decoder.decode(asarIntegrity)
    const checksums = JSON.parse(checksumData).map((data: AsarIntegrity) => ({ ...data, alg: "SHA256", value: "hash" }))
    expect(checksums).toMatchSnapshot()
  }

  const hasTarget = (target: string) => {
    const targets = nameToTarget.get(target)
    return targets != null
  }
  if (hasTarget("squirrel")) {
    return checkSquirrelResult()
  } else if (hasTarget("zip") && !(checkOptions.signed || checkOptions.signedWin)) {
    return checkZipResult()
  }
}

const checkResult = (expect: ExpectStatic, artifacts: Array<ArtifactCreated>, extension: string) => {
  const packageFile = artifacts.find(it => it.file.endsWith(extension))!.file

  const zip = new AdmZip(packageFile)
  const zipEntries = zip.getEntries()
  const allFiles: string[] = []
  // https://github.com/thejoshwolfe/yauzl/blob/master/index.js#L900
  const cp437 =
    "\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ "
  const decodeBuffer = (buffer: Buffer, isUtf8: boolean) => {
    if (isUtf8) {
      return buffer.toString("utf8")
    } else {
      let result = ""
      for (let i = 0; i < buffer.length; i++) {
        result += cp437[buffer[i]]
      }
      return result
    }
  }

  zipEntries.forEach(function (zipEntry) {
    const isUtf8 = (zipEntry.header.flags & 0x800) !== 0
    const name = decodeBuffer(zipEntry.rawEntryName, isUtf8)
    allFiles.push(name)
  })

  // we test app-update.yml separately, don't want to complicate general assert (yes, it is not good that we write app-update.yml for squirrel.windows if we build nsis and squirrel.windows in parallel, but as squirrel.windows is deprecated, it is ok)
  const files = pathSorter(
    allFiles
      .map(it => toSystemIndependentPath(it))
      .filter(
        it =>
          (!it.startsWith("lib/net45/locales/") || it === "lib/net45/locales/en-US.pak") && !it.endsWith(".psmdcp") && !it.endsWith("app-update.yml") && !it.includes("/inspector/")
      )
  )

  expect(files).toMatchSnapshot()

  return { packageFile, zip, allFiles }
}

export const execShell: any = promisify(require("child_process").exec)

export async function getTarExecutable() {
  return process.platform === "darwin" ? path.join(await getLinuxToolsPath(), "bin", "gtar") : "tar"
}

async function getContents(packageFile: string) {
  const result = await execShell(`ar p '${packageFile}' data.tar.xz | ${await getTarExecutable()} -tJ`, {
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
    },
  })

  const contents = parseFileList(result.stdout, true)
  return pathSorter(contents.filter(it => !(it.includes(`/locales/`) || it.includes(`/libgcrypt`) || it.includes("/inspector/"))))
}

export function parseFileList(data: string, fromDpkg: boolean): Array<string> {
  return data
    .split("\n")
    .map(it => (it.length === 0 ? null : fromDpkg ? it.substring(it.indexOf(".") + 1) : it.startsWith("./") ? it.substring(2) : it === "." ? null : it))
    .filter(it => it != null && it.length > 0) as Array<string>
}

export function packageJson(task: (data: any) => void, isApp = false) {
  return (projectDir: string) => modifyPackageJson(projectDir, task, isApp)
}

export async function modifyPackageJson(projectDir: string, task: (data: any) => void, isApp = false): Promise<any> {
  const file = isApp ? path.join(projectDir, "app", "package.json") : path.join(projectDir, "package.json")
  const data = await fs.readFile(file, "utf-8").then(it => JSON.parse(it))
  task(data)
  // because copied as hard link
  await fs.unlink(file)

  await fs.writeFile(path.join(projectDir, ".yarnrc.yml"), "nodeLinker: node-modules")
  return await writeJson(file, data, { spaces: 2 })
}

export function platform(platform: Platform): PackagerOptions {
  return {
    targets: platform.createTarget(),
  }
}

export function signed(packagerOptions: PackagerOptions): PackagerOptions {
  if (process.env.CSC_KEY_PASSWORD == null) {
    log.warn({ reason: "CSC_KEY_PASSWORD is not defined" }, "macOS code signing is not tested")
  } else {
    if (packagerOptions.config == null) {
      ;(packagerOptions as any).config = {}
    }
    ;(packagerOptions.config as any).cscLink = MAC_CSC_LINK
  }
  return packagerOptions
}

export function createMacTargetTest(expect: ExpectStatic, target: Array<MacOsTargetName>, config?: Configuration, isSigned = true) {
  return app(
    expect,
    {
      targets: Platform.MAC.createTarget(target, Arch.x64),
      config: {
        extraMetadata: {
          repository: "foo/bar",
        } as any,
        mac: {
          target,
        },
        publish: null,
        ...config,
      },
    },
    {
      signed: isSigned,
      packed: async context => {
        if (!target.includes("tar.gz")) {
          return
        }

        const tempDir = await context.tmpDir.createTempDir({ prefix: "mac-target-test" })
        await exec("tar", ["xf", path.join(context.outDir, "Test App ßW-1.1.0-mac.tar.gz")], { cwd: tempDir })
        await assertThat(expect, path.join(tempDir, "Test App ßW.app")).isDirectory()
      },
    }
  )
}

export async function checkDirContents(expect: ExpectStatic, dir: string) {
  expect((await walk(dir, file => !path.basename(file).startsWith("."))).map(it => toSystemIndependentPath(it.substring(dir.length + 1)))).toMatchSnapshot()
}

export function removeUnstableProperties(data: any) {
  return JSON.parse(
    JSON.stringify(data, (name, value) => {
      if (name.includes("size") || name.includes("Size") || name.startsWith("sha") || name === "releaseDate") {
        // to ensure that some property exists
        return `@${name}`
      }
      // Keep existing test coverage
      if (value.integrity) {
        delete value.integrity
      }
      return value
    })
  )
}

export async function verifyAsarFileTree(expect: ExpectStatic, resourceDir: string) {
  const fs = await readAsar(path.join(resourceDir, "app.asar"))

  const stableHeader = JSON.parse(
    JSON.stringify(fs.header, (name, value) => {
      // Keep existing test coverage
      if (value.integrity) {
        delete value.integrity
      }
      return value
    })
  )
  expect(stableHeader).toMatchSnapshot()
}

export function toSystemIndependentPath(s: string): string {
  return path.sep === "/" ? s : s.replace(/\\/g, "/")
}
