import { emptyDir, remove, writeJson, readJson, readFile, mkdir } from "fs-extra-p"
import { assertThat } from "./fileAssert"
import * as path from "path"
import { parse as parsePlist } from "plist"
import { CSC_LINK } from "./codeSignData"
import { expectedLinuxContents, expectedWinContents } from "./expectedContents"
import { Packager, PackagerOptions, Platform, ArtifactCreated, Arch, DIR_TARGET, createTargets, getArchSuffix, MacOsTargetName, Target, MacOptions, BuildInfo, SquirrelWindowsOptions } from "electron-builder"
import { exec, spawn, getTempName } from "electron-builder-util"
import { log, warn } from "electron-builder-util/out/log"
import pathSorter from "path-sort"
import DecompressZip from "decompress-zip"
import { convertVersion } from "electron-builder-squirrel-windows/out/squirrelPack"
import { TEST_DIR } from "./config"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { SignOptions } from "electron-builder/out/windowsCodeSign"
import { WinPackager } from "electron-builder/out/winPackager"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows"
import { DmgTarget } from "electron-builder/out/targets/dmg"
import OsXPackager from "electron-builder/out/macPackager"
import { SignOptions as MacSignOptions } from "electron-macos-sign"
import { copyDir, FileCopier } from "electron-builder-util/out/fs"
import isCi from "is-ci"
import { PublishManager } from "electron-builder/out/publish/PublishManager"

if (process.env.TRAVIS !== "true") {
  process.env.CIRCLE_BUILD_NUM = 42
}

const OUT_DIR_NAME = "dist"

interface AssertPackOptions {
  readonly projectDirCreated?: (projectDir: string) => Promise<any>
  readonly packed?: (context: PackedContext) => Promise<any>
  readonly expectedContents?: Array<string> | boolean
  readonly expectedArtifacts?: Array<string>

  readonly expectedDepends?: string
  readonly checkMacApp?: (appDir: string, info: any) => Promise<any>

  readonly useTempDir?: boolean
  readonly signed?: boolean

  readonly npmInstallBefore?: boolean
}

export interface PackedContext {
  readonly projectDir: string,
  readonly outDir: string

  readonly getResources: (platform: Platform, arch?: Arch) => string
  readonly getContent: (platform: Platform) => string

  readonly packager: Packager
}

let tmpDirCounter = 0
const testDir = path.join(TEST_DIR, process.pid.toString(16))

export function appThrows(error: RegExp, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertThat(assertPack("test-app-one", packagerOptions, checkOptions)).throws(error)
}

export function appTwoThrows(error: string | RegExp, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertThat(assertPack("test-app", packagerOptions, checkOptions)).throws(error)
}

export function app(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertPack("test-app-one", packagerOptions, checkOptions)
}

export function appTwo(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertPack("test-app", packagerOptions, checkOptions)
}

export function getTempFile() {
  return path.join(testDir, `${(tmpDirCounter++).toString(16)}`)
}

export async function assertPack(fixtureName: string, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}): Promise<void> {
  if (checkOptions.signed) {
    packagerOptions = signed(packagerOptions)
  }

  const projectDirCreated = checkOptions.projectDirCreated
  const useTempDir = process.env.TEST_APP_TMP_DIR != null || (checkOptions.useTempDir !== false && (checkOptions.useTempDir || projectDirCreated != null || packagerOptions.config != null || checkOptions.npmInstallBefore))

  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  let dirToDelete: string | null = null
  if (useTempDir) {
    // non-macOS test uses the same dir as macOS test, but we cannot share node_modules (because tests executed in parallel)
    const dir = customTmpDir == null ? getTempFile() : path.resolve(customTmpDir)
    if (customTmpDir == null) {
      dirToDelete = dir
    }
    else {
      log(`Custom temp dir used: ${customTmpDir}`)
    }
    await emptyDir(dir)
    await copyDir(projectDir, dir, it => {
      const basename = path.basename(it)
      return basename !== OUT_DIR_NAME && basename !== "node_modules" && !basename.startsWith(".")
    }, it => path.basename(it) != "package.json")
    projectDir = dir
  }

  try {
    if (projectDirCreated != null) {
      await projectDirCreated(projectDir)
      if (checkOptions.npmInstallBefore) {
        await spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--production", "--cache-min", "999999999", "--no-bin-links"], {
          cwd: projectDir
        })
      }
    }

    // never output to test fixture app
    if (!useTempDir) {
      dirToDelete = path.join(testDir, `${(tmpDirCounter++).toString(16)}`)
      const config = packagerOptions.config
      if (config != null && config.directories != null) {
        throw new Error("unsupported")
      }
      packagerOptions = deepAssign({}, packagerOptions, {config: {directories: {output: dirToDelete}}})
    }

    const outDir = useTempDir ? path.join(projectDir, OUT_DIR_NAME) : dirToDelete
    const packager = await packAndCheck(outDir, Object.assign({
      projectDir: projectDir,
    }, packagerOptions), checkOptions)

    if (checkOptions.packed != null) {
      function base(platform: Platform, arch?: Arch): string {
        return path.join(outDir, `${platform.buildConfigurationKey}${getArchSuffix(arch == null ? Arch.x64 : arch)}${platform === Platform.MAC ? "" : "-unpacked"}`)
      }

      await checkOptions.packed(<PackedContext>{
        projectDir: projectDir,
        outDir: outDir,
        getResources: (platform, arch) => path.join(base(platform, arch), "resources"),
        getContent: platform => base(platform),
        packager: packager,
      })
    }
  }
  finally {
    if (dirToDelete != null) {
      try {
        await remove(dirToDelete)
      }
      catch (e) {
        console.warn(`Cannot delete temporary directory ${dirToDelete}: ${(e.stack || e)}`)
      }
    }
  }
}

const fileCopier = new FileCopier()

export function copyTestAsset(name: string, destination: string): Promise<void> {
  return fileCopier.copy(path.join(__dirname, "..", "..", "fixtures", name), destination, undefined)
}

async function packAndCheck(outDir: string, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions): Promise<Packager> {
  const packager = new Packager(packagerOptions)
  const publishManager = new PublishManager(packager, {publish: "never"})

  const artifacts: Map<Platform, Array<ArtifactCreated>> = new Map()
  packager.artifactCreated(event => {
    if (event.file == null) {
      return
    }

    assertThat(event.file).isAbsolute()
    let list = artifacts.get(event.packager.platform)
    if (list == null) {
      list = []
      artifacts.set(event.packager.platform, list)
    }
    list.push(event)
  })

  const platformToTarget = await packager.build()
  await publishManager.awaitTasks()

  if (packagerOptions.platformPackagerFactory != null || packagerOptions.effectiveOptionComputed != null) {
    return packager
  }

  c: for (const [platform, archToType] of packagerOptions.targets) {
    for (const [arch, targets] of archToType) {
      if (targets.length === 1 && targets[0] === DIR_TARGET) {
        continue c
      }

      const nameToTarget = platformToTarget.get(platform)
      if (platform === Platform.MAC) {
        await checkMacResult(packager, packagerOptions, checkOptions, artifacts.get(Platform.MAC))
      }
      else if (platform === Platform.LINUX) {
        await checkLinuxResult(outDir, packager, checkOptions, artifacts.get(Platform.LINUX), arch, nameToTarget)
      }
      else if (platform === Platform.WINDOWS) {
        await checkWindowsResult(packager, checkOptions, artifacts.get(Platform.WINDOWS), arch, nameToTarget)
      }
    }
  }

  return packager
}

async function checkLinuxResult(outDir: string, packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, arch: Arch, nameToTarget: Map<String, Target>) {
  const appInfo = packager.appInfo

  function getExpected(): Array<string> {
    const result: Array<string> = []
    for (const target of nameToTarget.keys()) {
      if (target === "appimage") {
        result.push(`${appInfo.name}-${appInfo.version}-${arch === Arch.x64 ? "x86_64" : Arch[arch]}.AppImage`)
      }
      else if (target === "deb" || target === "snap") {
        result.push(`${appInfo.name}_${appInfo.version}_${arch === Arch.x64 ? "amd64" : Arch[arch]}.${target}`)
      }
      else {
        result.push(`TestApp-${appInfo.version}.${target}`)
      }
    }
    return result
  }

  assertThat(getFileNames(artifacts)).containsAll(getExpected())

  if (!nameToTarget.has("deb")) {
    return
  }

  const productFilename = appInfo.productFilename
  const expectedContents = pathSorter(expectedLinuxContents.map(it => {
    if (it === "/opt/TestApp/TestApp") {
      return `/opt/${productFilename}/TestApp`
    }
    else {
      return it.replace(new RegExp("/opt/TestApp/", "g"), `/opt/${productFilename}/`)
    }
  }))

  const packageFile = `${outDir}/TestApp_${appInfo.version}_${arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "amd64" : "armv7l")}.deb`
  expect(await getContents(packageFile)).toEqual(expectedContents)
  if (arch === Arch.ia32) {
    expect(await getContents(`${outDir}/TestApp_${appInfo.version}_i386.deb`)).toEqual(expectedContents)
  }

  expect(parseDebControl(await exec("dpkg", ["--info", packageFile]))).toMatchObject({
    License: "MIT",
    Homepage: "http://foo.example.com",
    Maintainer: "Foo Bar <foo@example.com>",
    Vendor: "Foo Bar <foo@example.com>",
    Package: "testapp",
    Description: " \n   Test Application (test quite “ #378)",
    Depends: checkOptions == null || checkOptions.expectedDepends == null ? "gconf2, gconf-service, libnotify4, libappindicator1, libxtst6, libnss3" : checkOptions.expectedDepends,
    Section: "devel",
  })
}

function parseDebControl(info: string): any {
  const regexp = /([\w]+): *(.+\n)([^:\n]+\n)?/g
  let match: Array<string>
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

async function checkMacResult(packager: Packager, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>) {
  const appInfo = packager.appInfo
  const packedAppDir = path.join(path.dirname(artifacts.find(it => it.file != null && !it.file.endsWith("json")).file), `${appInfo.productFilename}.app`)
  const info = parsePlist(await readFile(path.join(packedAppDir, "Contents", "Info.plist"), "utf8"))
  expect(info).toMatchObject({
    CFBundleDisplayName: appInfo.productName,
    CFBundleIdentifier: "org.electron-builder.testApp",
    LSApplicationCategoryType: "your.app.category.type",
    CFBundleVersion: `${appInfo.version}.${(process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)}`
  })

  // checked manually, remove to avoid mismatch on CI server (where TRAVIS_BUILD_NUMBER is defined and different on each test run)
  delete info.CFBundleVersion
  delete info.NSHumanReadableCopyright
  if (checkOptions.checkMacApp != null) {
    await checkOptions.checkMacApp(packedAppDir, info)
  }

  if (packagerOptions.cscLink != null) {
    const result = await exec("codesign", ["--verify", packedAppDir])
    expect(result).not.toMatch(/is not signed at all/)
  }

  const emptyTarget = {name: ""}
  expect(artifacts.sort((a, b) => (a.target || emptyTarget).name.localeCompare((b.target || emptyTarget).name)).map(it => {
    const result: any = Object.assign({}, it)
    if (result.file != null) {
      result.file = path.basename(result.file)
    }
    delete result.packager
    delete result.target
    delete result.publishConfig
    return result
  })).toMatchSnapshot()
}

function getFileNames(list: Array<ArtifactCreated>): Array<string> {
  return list.map(it => path.basename(it.file))
}

async function checkWindowsResult(packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, arch: Arch, nameToTarget: Map<String, Target>) {
  const appInfo = packager.appInfo
  let squirrel = false

  const artifactNames: Array<string> = []
  const expectedFileNames: Array<string> = []
  const archSuffix = getArchSuffix(arch)
  const buildOptions = packager.config.win
  for (const target of nameToTarget.keys()) {
    if (target === "squirrel") {
      squirrel = true
      expectedFileNames.push("RELEASES", `${appInfo.productFilename} Setup ${appInfo.version}${archSuffix}.exe`, `${appInfo.name}-${convertVersion(appInfo.version)}-full.nupkg`)

      if (buildOptions != null && (<SquirrelWindowsOptions>buildOptions).remoteReleases != null) {
        expectedFileNames.push(`${appInfo.name}-${convertVersion(appInfo.version)}-delta.nupkg`)
      }

      artifactNames.push(`${appInfo.name}-Setup-${appInfo.version}${archSuffix}.exe`)
    }
    else if (target === "nsis") {
      expectedFileNames.push(`${appInfo.productFilename} Setup ${appInfo.version}.exe`)
      artifactNames.push(`${appInfo.name}-Setup-${appInfo.version}.exe`)
    }
    else {
      expectedFileNames.push(`${appInfo.productFilename}-${appInfo.version}${archSuffix}-win.${target}`)
      artifactNames.push(`${appInfo.name}-${appInfo.version}${archSuffix}-win.${target}`)
    }
  }

  // we test latest.yml separately, don't want to complicate general assert
  assertThat(getFileNames(artifacts).filter(it => it !== "latest.yml")).containsAll(expectedFileNames)

  if (!squirrel) {
    return
  }

  assertThat(artifacts.map(it => it.artifactName).filter(it => it != null)).containsAll(artifactNames)

  const packageFile = artifacts.find(it => it.file.endsWith("-full.nupkg"))!.file
  const unZipper = new DecompressZip(packageFile)
  const fileDescriptors = await unZipper.getFiles()

  // we test app-update.yml separately, don't want to complicate general assert (yes, it is not good that we write app-update.yml for squirrel.windows if we build nsis and squirrel.windows in parallel, but as squirrel.windows is deprecated, it is ok)
  const files = pathSorter(fileDescriptors.map(it => it.path.replace(/\\/g, "/")).filter(it => (!it.startsWith("lib/net45/locales/") || it === "lib/net45/locales/en-US.pak") && !it.endsWith(".psmdcp") && !it.endsWith("app-update.yml")))

  // console.log(JSON.stringify(files, null, 2))
  const expectedContents = checkOptions == null || checkOptions.expectedContents == null ? expectedWinContents : checkOptions.expectedContents
  if (expectedContents === true) {
    expect(files).toMatchSnapshot()
  }
  else {
    expect(files).toEqual(pathSorter((<Array<string>>expectedContents).map(it => {
      if (it === "lib/net45/TestApp.exe") {
        if (appInfo.productFilename === "Test App ßW") {
          return `lib/net45/Test%20App%20%C3%9FW.exe`
        }
        return `lib/net45/${encodeURI(appInfo.productFilename).replace(/%5B/g, "[").replace(/%5D/g, "]")}.exe`
      }
      else if (it === "lib/net45/TestApp_ExecutionStub.exe") {
        if (appInfo.productFilename === "Test App ßW") {
          return `lib/net45/Test%20App%20%C3%9FW_ExecutionStub.exe`
        }
        return `lib/net45/${encodeURI(appInfo.productFilename).replace(/%5B/g, "[").replace(/%5D/g, "]")}_ExecutionStub.exe`
      }
      else {
        return it
      }
    })))
  }

  if (checkOptions == null || checkOptions.expectedContents == null) {
    await unZipper.extractFile(fileDescriptors.filter(it => it.path === "TestApp.nuspec")[0], {
      path: path.dirname(packageFile),
    })
    const expectedSpec = (await readFile(path.join(path.dirname(packageFile), "TestApp.nuspec"), "utf8")).replace(/\r\n/g, "\n")
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

async function getContents(path: string) {
  const result = await exec("dpkg", ["--contents", path])
  return pathSorter(result
    .split("\n")
    .map(it => it.length === 0 ? null : it.substring(it.indexOf(".") + 1))
    .filter(it => it != null && !(it.includes(`/locales/`) || it.includes(`/libgcrypt`)))
    )
}

export function packageJson(task: (data: any) => void, isApp = false) {
  return (projectDir: string) => modifyPackageJson(projectDir, task, isApp)
}

export async function modifyPackageJson(projectDir: string, task: (data: any) => void, isApp = false): Promise<any> {
  const file = isApp ? path.join(projectDir, "app", "package.json") : path.join(projectDir, "package.json")
  const data = await readJson(file)
  task(data)
  return await writeJson(file, data)
}

export function platform(platform: Platform): PackagerOptions {
  return {
    targets: platform.createTarget()
  }
}

export function signed(packagerOptions: PackagerOptions): PackagerOptions {
  if (process.env.CSC_KEY_PASSWORD == null) {
    warn("macOS code sign is not tested — CSC_KEY_PASSWORD is not defined")
  }
  else {
    packagerOptions.cscLink = CSC_LINK
  }
  return packagerOptions
}

export function getPossiblePlatforms(type?: string): Map<Platform, Map<Arch, string[]>> {
  const platforms = [Platform.fromString(process.platform)]
  if (process.platform === Platform.MAC.nodeName) {
    platforms.push(Platform.LINUX)
    if (!isCi) {
      platforms.push(Platform.WINDOWS)
    }
  }
  else if (process.platform === Platform.LINUX.nodeName && process.env.SKIP_WIN == null) {
    platforms.push(Platform.WINDOWS)
  }
  return createTargets(platforms, type)
}

export class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any
  signOptions: SignOptions | null

  constructor(info: BuildInfo) {
    super(info)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    // skip pack
    const helperClass: typeof SquirrelWindowsTarget = require("electron-builder-squirrel-windows").default
    this.effectiveDistOptions = await (new helperClass(this, outDir).computeEffectiveDistOptions())

    await this.sign(this.computeAppOutDir(outDir, arch))
  }

  packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }

  protected async doSign(opts: SignOptions): Promise<any> {
    this.signOptions = opts
  }
}

export class CheckingMacPackager extends OsXPackager {
  effectiveDistOptions: any
  effectiveSignOptions: MacSignOptions

  constructor(info: BuildInfo) {
    super(info)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    for (const target of targets) {
      // do not use instanceof to avoid dmg require
      if (target.name === "dmg") {
        this.effectiveDistOptions = await (<DmgTarget>target).computeDmgOptions()
        break
      }
    }
    // http://madole.xyz/babel-plugin-transform-async-to-module-method-gotcha/
    return await OsXPackager.prototype.pack.call(this, outDir, arch, targets, postAsyncTasks)
  }

  async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, customBuildOptions: MacOptions, postAsyncTasks: Array<Promise<any>> = null) {
    // skip
  }

  async doSign(opts: MacSignOptions): Promise<any> {
    this.effectiveSignOptions = opts
  }

  async doFlat(appPath: string, outFile: string, identity: string, keychain?: string | null): Promise<any> {
    // skip
  }

  packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }

  protected async writeUpdateInfo(appOutDir: string, outDir: string) {
    // ignored
  }
}

export function createMacTargetTest(target: Array<MacOsTargetName>) {
  return app({
    targets: Platform.MAC.createTarget(),
    appMetadata: <any>{
      repository: "foo/bar",
    },
    config: {
      mac: {
        target: target,
      }
    }
  }, {
    useTempDir: true,
    signed: target.includes("mas") || target.includes("pkg"),
    packed: async (context) => {
      if (!target.includes("tar.gz")) {
        return
      }

      const tempDir = path.join(context.outDir, getTempName())
      await mkdir(tempDir)
      await exec("tar", ["xf", path.join(context.outDir, "mac", "Test App ßW-1.1.0-mac.tar.gz")], {cwd: tempDir})
      await assertThat(path.join(tempDir, "Test App ßW.app")).isDirectory()
    }
  })
}

export function allPlatforms(dist = true): PackagerOptions {
  return {
    targets: getPossiblePlatforms(dist ? null : DIR_TARGET),
  }
}

export function convertUpdateInfo(info: any) {
  if (info.releaseDate != null) {
    info.releaseDate = "1970-01-01T00:00:00.000Z"
  }
  return info
}