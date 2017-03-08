import DecompressZip from "decompress-zip"
import { Arch, ArtifactCreated, DIR_TARGET, getArchSuffix, MacOsTargetName, Packager, PackagerOptions, Platform, Target } from "electron-builder"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { convertVersion } from "electron-builder-squirrel-windows/out/squirrelPack"
import { addValue, exec, getTempName, spawn } from "electron-builder-util"
import { copyDir, FileCopier } from "electron-builder-util/out/fs"
import { log, warn } from "electron-builder-util/out/log"
import { PublishManager } from "electron-builder/out/publish/PublishManager"
import { computeArchToTargetNamesMap } from "electron-builder/out/targets/targetFactory"
import { emptyDir, mkdir, readFile, readJson, remove, writeJson } from "fs-extra-p"
import * as path from "path"
import pathSorter from "path-sort"
import { parse as parsePlist } from "plist"
import { CSC_LINK } from "./codeSignData"
import { TEST_DIR } from "./config"
import { expectedLinuxContents, expectedWinContents } from "./expectedContents"
import { assertThat } from "./fileAssert"

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

export function appThrows(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertThat(assertPack("test-app-one", packagerOptions, checkOptions)).throws()
}

export function appTwoThrows(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}) {
  return () => assertThat(assertPack("test-app", packagerOptions, checkOptions)).throws()
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
  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  let dirToDelete: string | null = null
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

  try {
    if (projectDirCreated != null) {
      await projectDirCreated(projectDir)
      if (checkOptions.npmInstallBefore) {
        await spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--production", "--cache-min", "999999999", "--no-bin-links"], {
          cwd: projectDir
        })
      }
    }

    const {packager, outDir} = await packAndCheck(Object.assign({
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
  return fileCopier.copy(path.join(getFixtureDir(), name), destination, undefined)
}

export function getFixtureDir() {
  return path.join(__dirname, "..", "..", "fixtures")
}

async function packAndCheck(packagerOptions: PackagerOptions, checkOptions: AssertPackOptions) {
  const cancellationToken = new CancellationToken()
  const packager = new Packager(packagerOptions, cancellationToken)
  const publishManager = new PublishManager(packager, {publish: "never"}, cancellationToken)

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

  if (packagerOptions.platformPackagerFactory != null || packagerOptions.effectiveOptionComputed != null) {
    return {packager, outDir}
  }

  function sortKey(a: ArtifactCreated) {
    return `${a.target == null ? "no-target" : a.target.name}:${a.file == null ? a.data.toString("hex") : path.basename(a.file)}`
  }

  const objectToCompare: any = {}
  for (const platform of packagerOptions.targets.keys()) {
    objectToCompare[platform.buildConfigurationKey] = (artifacts.get(platform) || [])
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .map(it => {
        const result: any = Object.assign({}, it)
        if (result.file != null) {
          result.file = path.basename(result.file)
        }

        // reduce snapshot - avoid noise
        if (result.safeArtifactName == null) {
          delete result.safeArtifactName
        }

        delete result.packager
        delete result.target
        delete result.publishConfig
        return result
      })
  }

  expect(objectToCompare).toMatchSnapshot()

  c: for (const [platform, archToType] of packagerOptions.targets) {
    for (const [arch, targets] of computeArchToTargetNamesMap(archToType, (<any>packagerOptions)[platform.buildConfigurationKey] || {}, platform)) {
      if (targets.length === 1 && targets[0] === DIR_TARGET) {
        continue c
      }

      const nameToTarget = platformToTargets.get(platform)
      if (platform === Platform.MAC) {
        const packedAppDir = path.join(outDir, nameToTarget.has("mas") ? "mas" : "mac", `${packager.appInfo.productFilename}.app`)
        await checkMacResult(packager, packagerOptions, checkOptions, packedAppDir)
      }
      else if (platform === Platform.LINUX) {
        await checkLinuxResult(outDir, packager, checkOptions, arch, nameToTarget)
      }
      else if (platform === Platform.WINDOWS) {
        await checkWindowsResult(packager, checkOptions, artifacts.get(platform), nameToTarget)
      }
    }
  }

  return {packager, outDir}
}

async function checkLinuxResult(outDir: string, packager: Packager, checkOptions: AssertPackOptions, arch: Arch, nameToTarget: Map<String, Target>) {
  if (!nameToTarget.has("deb")) {
    return
  }

  const appInfo = packager.appInfo
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

async function checkMacResult(packager: Packager, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions, packedAppDir: string) {
  const appInfo = packager.appInfo
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
}

async function checkWindowsResult(packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, nameToTarget: Map<String, Target>) {
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
  return pathSorter(parseFileList(result, true)
    .filter(it => !(it.includes(`/locales/`) || it.includes(`/libgcrypt`)))
  )
}

export function parseFileList(data: string, fromDpkg: boolean): Array<string> {
  return data
    .split("\n")
    .map(it => it.length === 0 ? null : fromDpkg ? it.substring(it.indexOf(".") + 1) : (it.startsWith("./") ? it.substring(2) : (it == "." ? null : it)))
    .filter(it => it != null && it.length > 0)
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

export function convertUpdateInfo(info: any) {
  if (info.releaseDate != null) {
    info.releaseDate = "1970-01-01T00:00:00.000Z"
  }
  return info
}