import { path7x, path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { addValue, exec, log, spawn, warn } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { getLinuxToolsPath } from "builder-util/out/bundledTool"
import { copyDir, FileCopier, walk } from "builder-util/out/fs"
import { executeFinally } from "builder-util/out/promise"
import DecompressZip from "decompress-zip"
import { Arch, ArtifactCreated, Configuration, DIR_TARGET, getArchSuffix, MacOsTargetName, Packager, PackagerOptions, Platform, Target } from "electron-builder"
import { convertVersion } from "electron-builder-squirrel-windows/out/squirrelPack"
import { PublishManager } from "electron-builder/out/publish/PublishManager"
import { computeArchToTargetNamesMap } from "electron-builder/out/targets/targetFactory"
import { PublishPolicy } from "electron-publish"
import { emptyDir, readFile, readJson, writeJson } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import pathSorter from "path-sort"
import { parse as parsePlist } from "plist"
import { deepAssign } from "read-config-file/out/deepAssign"
import { TmpDir } from "temp-file"
import { CSC_LINK, WIN_CSC_LINK } from "./codeSignData"
import { assertThat } from "./fileAssert"

if (process.env.TRAVIS !== "true") {
  process.env.CIRCLE_BUILD_NUM = "42"
}

const OUT_DIR_NAME = "dist"

export const linuxDirTarget = Platform.LINUX.createTarget(DIR_TARGET)

interface AssertPackOptions {
  readonly projectDirCreated?: (projectDir: string, tmpDir: TmpDir) => Promise<any>
  readonly packed?: (context: PackedContext) => Promise<any>
  readonly expectedArtifacts?: Array<string>

  readonly checkMacApp?: (appDir: string, info: any) => Promise<any>

  readonly useTempDir?: boolean
  readonly signed?: boolean
  readonly signedWin?: boolean

  readonly installDepsBefore?: boolean

  readonly publish?: PublishPolicy
}

export interface PackedContext {
  readonly projectDir: string,
  readonly outDir: string

  readonly getResources: (platform: Platform, arch?: Arch) => string
  readonly getContent: (platform: Platform) => string

  readonly packager: Packager

  readonly tmpDir: TmpDir
}

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

export async function assertPack(fixtureName: string, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions = {}): Promise<void> {
  if (checkOptions.signed) {
    packagerOptions = signed(packagerOptions)
  }
  if (checkOptions.signedWin) {
    packagerOptions.cscLink = WIN_CSC_LINK
    packagerOptions.cscKeyPassword = ""
  }
  else if (packagerOptions.cscLink == null) {
    packagerOptions = deepAssign({}, packagerOptions, {config: {mac: {identity: null}}})
  }

  const projectDirCreated = checkOptions.projectDirCreated
  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  const tmpDir = new TmpDir()
  // non-macOS test uses the same dir as macOS test, but we cannot share node_modules (because tests executed in parallel)
  const dir = customTmpDir == null ? await tmpDir.createTempDir() : path.resolve(customTmpDir)
  if (customTmpDir != null) {
    await emptyDir(dir)
    log(`Custom temp dir used: ${customTmpDir}`)
  }

  await copyDir(projectDir, dir, {
    filter: it => {
      const basename = path.basename(it)
      // if custom project dir specified, copy node_modules (i.e. do not ignore it)
      return basename !== OUT_DIR_NAME && (packagerOptions.projectDir != null || basename !== "node_modules") && !basename.startsWith(".")
    },
    isUseHardLink: it => path.basename(it) !== "package.json",
  })
  projectDir = dir

  await executeFinally((async () => {
    if (projectDirCreated != null) {
      await projectDirCreated(projectDir, tmpDir)
      if (checkOptions.installDepsBefore) {
        // bin links required (e.g. for node-pre-gyp - if package refers to it in the install script)
        await spawn(process.platform === "win32" ? "yarn.cmd" : "yarn", ["install", "--production", "--no-lockfile"], {
          cwd: projectDir,
        })
      }
    }

    if (packagerOptions.projectDir != null) {
      packagerOptions.projectDir = path.resolve(projectDir, packagerOptions.projectDir)
    }

    const {packager, outDir} = await packAndCheck({
      projectDir,
      ...packagerOptions
    }, checkOptions)

    if (checkOptions.packed != null) {
      function base(platform: Platform, arch?: Arch): string {
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
  })(), () => tmpDir.cleanup())
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
  const publishManager = new PublishManager(packager, {publish: checkOptions.publish || "never"}, cancellationToken)

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
    objectToCompare[platform.buildConfigurationKey] = await BluebirdPromise.map((artifacts.get(platform) || []).sort((a, b) => sortKey(a).localeCompare(sortKey(b))), async it => {
      const result: any = {...it}
      const file = result.file
      if (file != null) {
        if (file.endsWith(".yml")) {
          result.fileContent = removeUnstableProperties(safeLoad(await readFile(file, "utf-8")))
        }
        result.file = path.basename(file)
      }
      const updateInfo = result.updateInfo
      if (updateInfo != null) {
        result.updateInfo = removeUnstableProperties(updateInfo)
      }

      // reduce snapshot - avoid noise
      if (result.safeArtifactName == null) {
        delete result.safeArtifactName
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
    })
  }

  expect(objectToCompare).toMatchSnapshot()

  c: for (const [platform, archToType] of packagerOptions.targets!!) {
    for (const [arch, targets] of computeArchToTargetNamesMap(archToType, (packagerOptions as any)[platform.buildConfigurationKey] || {}, platform)) {
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

  const control = parseDebControl(await execShell(`ar p '${packageFile}' control.tar.gz | ${await getTarExecutable()} zx --to-stdout ./control`, {
    maxBuffer: 10 * 1024 * 1024,
  }))
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
  const info = parsePlist(await readFile(path.join(packedAppDir, "Contents", "Info.plist"), "utf8"))

  expect(info).toMatchObject({
    CFBundleDisplayName: appInfo.productName,
    CFBundleIdentifier: "org.electron-builder.testApp",
    LSApplicationCategoryType: "your.app.category.type",
    CFBundleVersion: info.CFBundleVersion === "50" ? "50" : `${appInfo.version}.${(process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)}`
  })

  // checked manually, remove to avoid mismatch on CI server (where TRAVIS_BUILD_NUMBER is defined and different on each test run)
  delete info.CFBundleVersion
  delete info.NSHumanReadableCopyright

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

  if (packagerOptions.cscLink != null) {
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
  const files = pathSorter(fileDescriptors.map(it => it.path.replace(/\\/g, "/")).filter(it => (!it.startsWith("lib/net45/locales/") || it === "lib/net45/locales/en-US.pak") && !it.endsWith(".psmdcp") && !it.endsWith("app-update.yml")))

  expect(files).toMatchSnapshot()

  if (checkOptions == null) {
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

const execShell: any = BluebirdPromise.promisify(require("child_process").exec)

async function getTarExecutable() {
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
  return pathSorter(parseFileList(result, true)
    .filter(it => !(it.includes(`/locales/`) || it.includes(`/libgcrypt`)))
  )
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

export function createMacTargetTest(target: Array<MacOsTargetName>, config?: Configuration) {
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
    signed: true,
    packed: async context => {
      if (!target.includes("tar.gz")) {
        return
      }

      const tempDir = await context.tmpDir.createTempDir()
      await exec("tar", ["xf", path.join(context.outDir, "Test App ßW-1.1.0-mac.tar.gz")], {cwd: tempDir})
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

export async function checkDirContents(dir: string) {
  expect((await walk(dir, file => !path.basename(file).startsWith("."))).map(it => it.substring(dir.length + 1))).toMatchSnapshot()
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