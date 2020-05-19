import { path7x, path7za } from "7zip-bin"
import { addValue, deepAssign, exec, log, spawn } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { copyDir, FileCopier, USE_HARD_LINKS, walk } from "builder-util/out/fs"
import { executeFinally } from "builder-util/out/promise"
import DecompressZip from "decompress-zip"
import { Arch, ArtifactCreated, Configuration, DIR_TARGET, getArchSuffix, MacOsTargetName, Packager, PackagerOptions, Platform, Target } from "electron-builder"
import { PublishManager } from "app-builder-lib"
import { computeArchToTargetNamesMap } from "app-builder-lib/out/targets/targetFactory"
import { getLinuxToolsPath } from "app-builder-lib/out/targets/tools"
import { convertVersion } from "electron-builder-squirrel-windows/out/squirrelPack"
import { PublishPolicy } from "electron-publish"
import { emptyDir, writeJson } from "fs-extra"
import { promises as fs } from "fs"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { promisify } from "util"
import pathSorter from "path-sort"
import { TmpDir } from "temp-file"
import { readAsar } from "app-builder-lib/out/asar/asar"
import { executeAppBuilderAsJson } from "app-builder-lib/out/util/appBuilder"
import { CSC_LINK, WIN_CSC_LINK } from "./codeSignData"
import { assertThat } from "./fileAssert"

if (process.env.TRAVIS !== "true") {
  process.env.CIRCLE_BUILD_NUM = "42"
}

export const linuxDirTarget = Platform.LINUX.createTarget(DIR_TARGET)
export const snapTarget = Platform.LINUX.createTarget("snap")

export interface AssertPackOptions {
  readonly projectDirCreated?: (projectDir: string, tmpDir: TmpDir) => Promise<any>
  readonly packed?: (context: PackedContext) => Promise<any>
  readonly expectedArtifacts?: Array<string>

  readonly checkMacApp?: (appDir: string, info: any) => Promise<any>

  readonly useTempDir?: boolean
  readonly signed?: boolean
  readonly signedWin?: boolean

  readonly isInstallDepsBefore?: boolean

  readonly publish?: PublishPolicy

  readonly tmpDir?: TmpDir
}

export interface PackedContext {
  readonly projectDir: string,
  readonly outDir: string

  readonly getResources: (platform: Platform, arch?: Arch) => string
  readonly getContent: (platform: Platform) => string

  readonly packager: Packager

  readonly tmpDir: TmpDir
}

export function appThrows(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}, customErrorAssert?: (error: Error) => void) {
  return () => assertThat(assertPack("test-app-one", packagerOptions, checkOptions)).throws(customErrorAssert)
}

export function appTwoThrows(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertThat(assertPack("test-app", packagerOptions, checkOptions)).throws()
}

export function app(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertPack(packagerOptions.config != null && (packagerOptions.config as any).protonNodeVersion != null ? "proton" : "test-app-one", packagerOptions, checkOptions)
}

export function appTwo(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertPack("test-app", packagerOptions, checkOptions)
}

export async function assertPack(fixtureName: string, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}): Promise<void> {
  let configuration = packagerOptions.config as Configuration
  if (configuration == null) {
    configuration = {};
    (packagerOptions as any).config = configuration
  }

  if (checkOptions.signed) {
    packagerOptions = signed(packagerOptions)
  }
  if (checkOptions.signedWin) {
    configuration.cscLink = WIN_CSC_LINK
    configuration.cscKeyPassword = ""
  }
  else if ((configuration as Configuration).cscLink == null) {
    packagerOptions = deepAssign({}, packagerOptions, {config: {mac: {identity: null}}})
  }

  const projectDirCreated = checkOptions.projectDirCreated
  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  const tmpDir = checkOptions.tmpDir || new TmpDir(`pack-tester: ${fixtureName}`)
  // non-macOS test uses the same dir as macOS test, but we cannot share node_modules (because tests executed in parallel)
  const dir = customTmpDir == null ? await tmpDir.createTempDir({prefix: "test-project"}) : path.resolve(customTmpDir)
  if (customTmpDir != null) {
    await emptyDir(dir)
    log.info({customTmpDir}, "custom temp dir used")
  }

  await copyDir(projectDir, dir, {
    filter: it => {
      const basename = path.basename(it)
      // if custom project dir specified, copy node_modules (i.e. do not ignore it)
      return (packagerOptions.projectDir != null || basename !== "node_modules") && (!basename.startsWith(".") || basename === ".babelrc")
    },
    isUseHardLink: USE_HARD_LINKS,
  })
  projectDir = dir

  await executeFinally((async () => {
    if (projectDirCreated != null) {
      await projectDirCreated(projectDir, tmpDir)
    }

    if (checkOptions.isInstallDepsBefore) {
      // bin links required (e.g. for node-pre-gyp - if package refers to it in the install script)
      await spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--production"], {
        cwd: projectDir,
      })
    }

    if (packagerOptions.projectDir != null) {
      packagerOptions.projectDir = path.resolve(projectDir, packagerOptions.projectDir)
    }

    const {packager, outDir} = await packAndCheck({
      projectDir,
      ...packagerOptions
    }, checkOptions)

    if (checkOptions.packed != null) {
      const base = function (platform: Platform, arch?: Arch): string {
        return path.join(outDir, `${platform.buildConfigurationKey}${getArchSuffix(arch == null ? Arch.x64 : arch)}${platform === Platform.MAC ? "" : "-unpacked"}`)
      }

      await checkOptions.packed({
        projectDir,
        outDir,
        getResources: (platform, arch) => path.join(base(platform, arch), "resources"),
        getContent: platform => base(platform),
        packager,
        tmpDir,
      })
    }
  })(), (): any => tmpDir === checkOptions.tmpDir ? null : tmpDir.cleanup())
}

const fileCopier = new FileCopier()

export function copyTestAsset(name: string, destination: string): Promise<void> {
  return fileCopier.copy(path.join(getFixtureDir(), name), destination, undefined)
}

export function getFixtureDir() {
  return path.join(__dirname, "..", "..", "fixtures")
}

async function packAndCheck(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions) {
  const cancellationToken = new CancellationToken()
  const packager = new Packager(packagerOptions, cancellationToken)
  const publishManager = new PublishManager(packager, {publish: "publish" in checkOptions ? checkOptions.publish : "never"})

  const artifacts: Map<Platform, Array<ArtifactCreated>> = new Map()
  packager.artifactCreated(event => {
    if (event.file == null) {
      return
    }

    assertThat(event.file).isAbsolute()
    addValue(artifacts, event.packager.platform, event)
  })

  const {outDir, platformToTargets} = await packager.build()
  await publishManager.awaitTasks()

  if (packagerOptions.platformPackagerFactory != null) {
    return {packager, outDir}
  }

  function sortKey(a: ArtifactCreated) {
    return `${a.target == null ? "no-target" : a.target.name}:${a.file == null ? a.fileContent!!.toString("hex") : path.basename(a.file)}`
  }

  const objectToCompare: any = {}
  for (const platform of packagerOptions.targets!!.keys()) {
    objectToCompare[platform.buildConfigurationKey] = await Promise.all((artifacts.get(platform) || []).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(async it => {
      const result: any = {...it}
      const file = result.file
      if (file != null) {
        if (file.endsWith(".yml")) {
          result.fileContent = removeUnstableProperties(safeLoad(await fs.readFile(file, "utf-8")))
        }
        result.file = path.basename(file)
      }
      const updateInfo = result.updateInfo
      if (updateInfo != null) {
        result.updateInfo = removeUnstableProperties(updateInfo)
      }
      else if (updateInfo === null) {
        delete result.updateInfo
      }

      // reduce snapshot - avoid noise
      if (result.safeArtifactName == null) {
        delete result.safeArtifactName
      }
      if (result.updateInfo == null) {
        delete result.updateInfo
      }
      if (result.arch == null) {
        delete result.arch
      }
      else {
        result.arch = Arch[result.arch]
      }

      if (Buffer.isBuffer(result.fileContent)) {
        delete result.fileContent
      }

      delete result.isWriteUpdateInfo
      delete result.packager
      delete result.target
      delete result.publishConfig
      return result
    }))
  }

  expect(objectToCompare).toMatchSnapshot()

  c: for (const [platform, archToType] of packagerOptions.targets!!) {
    for (const [arch, targets] of computeArchToTargetNamesMap(archToType, {platformSpecificBuildOptions: (packagerOptions as any)[platform.buildConfigurationKey] || {}, defaultTarget: []} as any, platform)) {
      if (targets.length === 1 && targets[0] === DIR_TARGET) {
        continue c
      }

      const nameToTarget = platformToTargets.get(platform)!!
      if (platform === Platform.MAC) {
        const packedAppDir = path.join(outDir, nameToTarget.has("mas-dev") ? "mas-dev" : (nameToTarget.has("mas") ? "mas" : "mac"), `${packager.appInfo.productFilename}.app`)
        await checkMacResult(packager, packagerOptions, checkOptions, packedAppDir)
      }
      else if (platform === Platform.LINUX) {
        await checkLinuxResult(outDir, packager, arch, nameToTarget)
      }
      else if (platform === Platform.WINDOWS) {
        await checkWindowsResult(packager, checkOptions, artifacts.get(platform)!!, nameToTarget)
      }
    }
  }

  return {packager, outDir}
}

async function checkLinuxResult(outDir: string, packager: Packager, arch: Arch, nameToTarget: Map<string, Target>) {
  if (!nameToTarget.has("deb")) {
    return
  }

  const appInfo = packager.appInfo
  const packageFile = `${outDir}/TestApp_${appInfo.version}_${arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "amd64" : "armv7l")}.deb`
  expect(await getContents(packageFile)).toMatchSnapshot()
  if (arch === Arch.ia32) {
    expect(await getContents(`${outDir}/TestApp_${appInfo.version}_i386.deb`)).toMatchSnapshot()
  }

  const control = parseDebControl((await execShell(`ar p '${packageFile}' control.tar.gz | ${await getTarExecutable()} zx --to-stdout ./control`, {
      maxBuffer: 10 * 1024 * 1024,
    })).stdout)

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

async function checkMacResult(packager: Packager, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions, packedAppDir: string) {
  const appInfo = packager.appInfo
  const info = (await executeAppBuilderAsJson<Array<any>>(["decode-plist", "-f", path.join(packedAppDir, "Contents", "Info.plist")]))[0]

  expect(info).toMatchObject({
    CFBundleVersion: info.CFBundleVersion === "50" ? "50" : `${appInfo.version}.${(process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)}`
  })

  // checked manually, remove to avoid mismatch on CI server (where TRAVIS_BUILD_NUMBER is defined and different on each test run)
  delete info.AsarIntegrity
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
    delete info.NSAppTransportSecurity.NSAllowsArbitraryLoads
  }
  // test value
  if (info.LSMinimumSystemVersion !== "10.12.0") {
    delete info.LSMinimumSystemVersion
  }

  expect(info).toMatchSnapshot()

  const checksumData = info.AsarIntegrity
  if (checksumData != null) {
    const data = JSON.parse(checksumData)
    const checksums = data.checksums
    for (const name of Object.keys(checksums)) {
      checksums[name] = "hash"
    }
    info.AsarIntegrity = JSON.stringify(data)
  }

  if (checkOptions.checkMacApp != null) {
    await checkOptions.checkMacApp(packedAppDir, info)
  }

  if (packagerOptions.config != null && (packagerOptions.config as Configuration).cscLink != null) {
    const result = await exec("codesign", ["--verify", packedAppDir])
    expect(result).not.toMatch(/is not signed at all/)
  }
}

async function checkWindowsResult(packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, nameToTarget: Map<string, Target>) {
  const appInfo = packager.appInfo
  let squirrel = false
  for (const target of nameToTarget.keys()) {
    if (target === "squirrel") {
      squirrel = true
      break
    }
  }
  if (!squirrel) {
    return
  }

  const packageFile = artifacts.find(it => it.file!!.endsWith("-full.nupkg"))!.file!!
  const unZipper = new DecompressZip(packageFile!!)
  const fileDescriptors = await unZipper.getFiles()

  // we test app-update.yml separately, don't want to complicate general assert (yes, it is not good that we write app-update.yml for squirrel.windows if we build nsis and squirrel.windows in parallel, but as squirrel.windows is deprecated, it is ok)
  const files = pathSorter(fileDescriptors.map(it => toSystemIndependentPath(it.path))
    .filter(it => (!it.startsWith("lib/net45/locales/") || it === "lib/net45/locales/en-US.pak") && !it.endsWith(".psmdcp") && !it.endsWith("app-update.yml") && !it.includes("/inspector/")))

  expect(files).toMatchSnapshot()

  if (checkOptions == null) {
    await unZipper.extractFile(fileDescriptors.filter(it => it.path === "TestApp.nuspec")[0], {
      path: path.dirname(packageFile),
    })
    const expectedSpec = (await fs.readFile(path.join(path.dirname(packageFile), "TestApp.nuspec"), "utf8")).replace(/\r\n/g, "\n")
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

export const execShell: any = promisify(require("child_process").exec)

export async function getTarExecutable() {
  return process.platform === "darwin" ? path.join(await getLinuxToolsPath(), "bin", "gtar") : "tar"
}

async function getContents(packageFile: string) {
  const result = await execShell(`ar p '${packageFile}' data.tar.xz | ${await getTarExecutable()} -t -I'${path7x}'`, {
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      SZA_PATH: path7za,
    }
  })

  const contents = parseFileList(result.stdout, true)
  return pathSorter(contents.filter(it => !(it.includes(`/locales/`) || it.includes(`/libgcrypt`) || it.includes("/inspector/"))))
}

export function parseFileList(data: string, fromDpkg: boolean): Array<string> {
  return data
    .split("\n")
    .map(it => it.length === 0 ? null : fromDpkg ? it.substring(it.indexOf(".") + 1) : (it.startsWith("./") ? it.substring(2) : (it === "." ? null : it)))
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
  return await writeJson(file, data)
}

export function platform(platform: Platform): PackagerOptions {
  return {
    targets: platform.createTarget()
  }
}

export function signed(packagerOptions: PackagerOptions): PackagerOptions {
  if (process.env.CSC_KEY_PASSWORD == null) {
    log.warn({reason: "CSC_KEY_PASSWORD is not defined"}, "macOS code signing is not tested")
  }
  else {
    if (packagerOptions.config == null) {
      (packagerOptions as any).config = {}
    }
    (packagerOptions.config as any).cscLink = CSC_LINK
  }
  return packagerOptions
}

export function createMacTargetTest(target: Array<MacOsTargetName>, config?: Configuration, isSigned = true) {
  return app({
    targets: Platform.MAC.createTarget(),
    config: {
      extraMetadata: {
        repository: "foo/bar",
      } as any,
      mac: {
        target,
      },
      publish: null,
      ...config
    },
  }, {
    signed: isSigned,
    packed: async context => {
      if (!target.includes("tar.gz")) {
        return
      }

      const tempDir = await context.tmpDir.createTempDir({prefix: "mac-target-test"})
      await exec("tar", ["xf", path.join(context.outDir, "Test App ßW-1.1.0-mac.tar.gz")], {cwd: tempDir})
      await assertThat(path.join(tempDir, "Test App ßW.app")).isDirectory()
    }
  })
}

export async function checkDirContents(dir: string) {
  expect((await walk(dir, file => !path.basename(file).startsWith("."))).map(it => toSystemIndependentPath(it.substring(dir.length + 1)))).toMatchSnapshot()
}

export function removeUnstableProperties(data: any) {
  return JSON.parse(JSON.stringify(data, (name, value) => {
    if (name.includes("size") || name.includes("Size") || name.startsWith("sha") || name === "releaseDate") {
      // to ensure that some property exists
      return `@${name}`
    }
    return value
  }))
}

export async function verifyAsarFileTree(resourceDir: string) {
  const fs = await readAsar(path.join(resourceDir, "app.asar"))
  // console.log(resourceDir + " " + JSON.stringify(fs.header, null, 2))
  expect(fs.header).toMatchSnapshot()
}

export function toSystemIndependentPath(s: string): string {
  return path.sep === "/" ? s : s.replace(/\\/g, "/")
}