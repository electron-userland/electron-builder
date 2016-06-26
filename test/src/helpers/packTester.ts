import { copy, emptyDir, remove, writeJson, readJson, readFile } from "fs-extra-p"
import * as assertThat2 from "should/as-function"
import { assertThat } from "./fileAssert"
import * as path from "path"
import { parse as parsePlist } from "plist"
import { CSC_LINK, CSC_KEY_PASSWORD, CSC_INSTALLER_LINK, CSC_INSTALLER_KEY_PASSWORD } from "./codeSignData"
import { expectedLinuxContents, expectedWinContents } from "./expectedContents"
import { Packager, PackagerOptions, Platform, ArtifactCreated, Arch, DIR_TARGET } from "out"
import { exec, getTempName } from "out/util/util"
import { log } from "out/util/log"
import { createTargets } from "out"
import { tmpdir } from "os"
import { getArchSuffix, Target } from "out/platformPackager"
import pathSorter = require("path-sort")
import DecompressZip = require("decompress-zip")
import { convertVersion } from "electron-winstaller-fixed"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

export const outDirName = "dist"

interface AssertPackOptions {
  readonly tempDirCreated?: (projectDir: string) => Promise<any>
  readonly packed?: (projectDir: string) => Promise<any>
  readonly expectedContents?: Array<string>
  readonly expectedArtifacts?: Array<string>

  readonly expectedDepends?: string

  readonly useTempDir?: boolean
}

export async function assertPack(fixtureName: string, packagerOptions: PackagerOptions, checkOptions?: AssertPackOptions): Promise<void> {
  const tempDirCreated = checkOptions == null ? null : checkOptions.tempDirCreated
  const useTempDir = tempDirCreated != null || packagerOptions.devMetadata != null || (checkOptions != null && checkOptions.useTempDir)

  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  if (useTempDir) {
    // non-osx test uses the same dir as osx test, but we cannot share node_modules (because tests executed in parallel)
    const dir = customTmpDir == null ? path.join(tmpdir(), `${getTempName("electron-builder-test")}`) : path.resolve(customTmpDir)
    if (customTmpDir != null) {
      log(`Custom temp dir used: ${customTmpDir}`)
    }
    await emptyDir(dir)
    await copy(projectDir, dir, {
      filter: it => {
        const basename = path.basename(it)
        return basename !== outDirName && basename !== "node_modules" && basename[0] !== "."
      }
    })
    projectDir = dir
  }

  try {
    if (tempDirCreated != null) {
      await tempDirCreated(projectDir)
    }

    await packAndCheck(projectDir, Object.assign({
      projectDir: projectDir,
    }, packagerOptions), checkOptions)

    if (checkOptions != null && checkOptions.packed != null) {
      await checkOptions.packed(projectDir)
    }
  }
  finally {
    if (useTempDir && customTmpDir == null) {
      try {
        await remove(projectDir)
      }
      catch (e) {
        console.warn("Cannot delete temporary directory " + projectDir + ": " + (e.stack || e))
      }
    }
  }
}

async function packAndCheck(projectDir: string, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions): Promise<void> {
  const packager = new Packager(packagerOptions)

  const artifacts: Map<Platform, Array<ArtifactCreated>> = new Map()
  packager.artifactCreated(event => {
    assertThat(event.file).isAbsolute()
    let list = artifacts.get(event.platform)
    if (list == null) {
      list = []
      artifacts.set(event.platform, list)
    }
    list.push(event)
  })

  const platformToTarget = await packager.build()

  if (packagerOptions.platformPackagerFactory != null || packagerOptions.effectiveOptionComputed != null) {
    return
  }

  c: for (let [platform, archToType] of packagerOptions.targets) {
    for (let [arch, targets] of archToType) {
      if (targets.length === 1 && targets[0] === DIR_TARGET) {
        continue c
      }

      const nameToTarget = platformToTarget.get(platform)
      if (platform === Platform.OSX) {
        await checkOsXResult(packager, packagerOptions, checkOptions, artifacts.get(Platform.OSX))
      }
      else if (platform === Platform.LINUX) {
        await checkLinuxResult(projectDir, packager, checkOptions, artifacts.get(Platform.LINUX), arch)
      }
      else if (platform === Platform.WINDOWS) {
        await checkWindowsResult(packager, checkOptions, artifacts.get(Platform.WINDOWS), arch, nameToTarget)
      }
    }
  }
}

async function checkLinuxResult(projectDir: string, packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, arch: Arch) {
  const customBuildOptions = packager.devMetadata.build.linux
  const targets = customBuildOptions == null || customBuildOptions.target == null ? ["default"] : customBuildOptions.target

  function getExpected(): Array<string> {
    const result: Array<string> = []
    for (let target of targets) {
      result.push(`TestApp-${packager.appInfo.version}.${target === "default" ? "deb" : target}`)
    }
    return result
  }

  assertThat(getFileNames(artifacts)).containsAll(getExpected())

  if (!targets.includes("deb") || !targets.includes("default")) {
    return
  }

  const productName = packager.appInfo.productName
  const expectedContents = expectedLinuxContents.map(it => {
    if (it === "/opt/TestApp/TestApp") {
      return "/opt/" + productName + "/" + productName
    }
    else if (it === "/usr/share/applications/TestApp.desktop") {
      return `/usr/share/applications/${productName}.desktop`
    }
    else {
      return it.replace(new RegExp("/opt/TestApp/", "g"), `/opt/${productName}/`)
    }
  })

  // console.log(JSON.stringify(await getContents(projectDir + "/dist/TestApp-1.0.0-amd64.deb", productName), null, 2))
  // console.log(JSON.stringify(await getContents(projectDir + "/dist/TestApp-1.0.0-i386.deb", productName), null, 2))

  const packageFile = `${projectDir}/${outDirName}/TestApp-${packager.appInfo.version}-amd64.deb`
  assertThat(await getContents(packageFile, productName)).isEqualTo(expectedContents)
  if (arch === Arch.ia32) {
    assertThat(await getContents(`${projectDir}/${outDirName}/TestApp-${packager.appInfo.version}-i386.deb`, productName)).isEqualTo(expectedContents)
  }

  assertThat2(parseDebControl(await exec("dpkg", ["--info", packageFile]))).has.properties({
    License: "MIT",
    Homepage: "http://foo.example.com",
    Maintainer: "Foo Bar <foo@example.com>",
    Vendor: "Foo Bar <foo@example.com>",
    Package: "testapp",
    Description: " \n   Test Application (test quite “ #378)",
    Depends: checkOptions == null || checkOptions.expectedDepends == null ? "libappindicator1, libnotify-bin" : checkOptions.expectedDepends,
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

    if (value[value.length - 1] == "\n") {
      value = value.substring(0, value.length - 1)
    }
    metadata[match[1]] = value
  }
  return metadata
}

async function checkOsXResult(packager: Packager, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>) {
  const appInfo = packager.appInfo
  const productName = appInfo.productName
  const packedAppDir = path.join(path.dirname(artifacts[0].file), (productName || packager.metadata.name) + ".app")
  const info = parsePlist(await readFile(path.join(packedAppDir, "Contents", "Info.plist"), "utf8"))
  assertThat2(info).has.properties({
    CFBundleDisplayName: productName,
    CFBundleIdentifier: "org.electron-builder.testApp",
    LSApplicationCategoryType: "your.app.category.type",
    CFBundleVersion: `${appInfo.version}.${(process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)}`
  })

  if (packagerOptions.cscLink != null) {
    const result = await exec("codesign", ["--verify", packedAppDir])
    assertThat2(result).not.match(/is not signed at all/)
  }

  const actualFiles = artifacts.map(it => path.basename(it.file)).sort()
  if (checkOptions != null && checkOptions.expectedContents != null) {
    assertThat(actualFiles).isEqualTo(checkOptions.expectedContents)
  }
  else {
    assertThat(actualFiles).isEqualTo([
      `${productName}-${appInfo.version}-mac.zip`,
      `${productName}-${appInfo.version}.dmg`,
    ].sort())

    assertThat(artifacts.map(it => it.artifactName).sort()).isEqualTo([
      `TestApp-${appInfo.version}-mac.zip`,
      `TestApp-${appInfo.version}.dmg`,
    ].sort())
  }
}

function getFileNames(list: Array<ArtifactCreated>): Array<string> {
  return list.map(it => path.basename(it.file))
}

async function checkWindowsResult(packager: Packager, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>, arch: Arch, nameToTarget: Map<String, Target>) {
  const appInfo = packager.appInfo
  const productName = appInfo.productName
  let squirrel = false

  const artifactNames: Array<string> = []
  const expectedFileNames: Array<string> = []
  const archSuffix = getArchSuffix(arch)
  const buildOptions = packager.devMetadata.build.win
  for (let target of nameToTarget.keys()) {
    if (target === "squirrel") {
      squirrel = true
      expectedFileNames.push("RELEASES", `${productName} Setup ${appInfo.version}${archSuffix}.exe`, `${appInfo.name}-${convertVersion(appInfo.version)}-full.nupkg`)

      if (buildOptions != null && buildOptions.remoteReleases != null) {
        expectedFileNames.push(`${appInfo.name}-${convertVersion(appInfo.version)}-delta.nupkg`)
      }

      artifactNames.push(`${appInfo.name}-Setup-${appInfo.version}${archSuffix}.exe`)
    }
    else if (target === "nsis") {
      expectedFileNames.push(`${productName} Setup ${appInfo.version}.exe`)
      artifactNames.push(`${appInfo.name}-Setup-${appInfo.version}.exe`)
    }
    else {
      expectedFileNames.push(`${productName}-${appInfo.version}${archSuffix}-win.${target}`)
      artifactNames.push(`${appInfo.name}-${appInfo.version}${archSuffix}-win.${target}`)
    }
  }

  assertThat(getFileNames(artifacts)).containsAll(expectedFileNames)

  if (!squirrel) {
    return
  }

  assertThat(artifacts.map(it => it.artifactName).filter(it => it != null)).containsAll(artifactNames)

  const packageFile = artifacts.find(it => it.file.endsWith("-full.nupkg"))!.file
  const unZipper = new DecompressZip(packageFile)
  const fileDescriptors = await unZipper.getFiles()

  const files = pathSorter(fileDescriptors.map(it => it.path.replace(/\\/g, "/")).filter(it => (!it.startsWith("lib/net45/locales/") || it === "lib/net45/locales/en-US.pak") && !it.endsWith(".psmdcp")))

  // console.log(JSON.stringify(files, null, 2))
  const expectedContents = checkOptions == null || checkOptions.expectedContents == null ? expectedWinContents : checkOptions.expectedContents
  assertThat(files).isEqualTo(expectedContents.map(it => {
    if (it === "lib/net45/TestApp.exe") {
      return `lib/net45/${encodeURI(productName)}.exe`
    }
    else {
      return it
    }
  }))

  if (checkOptions == null || checkOptions.expectedContents == null) {
    await unZipper.extractFile(fileDescriptors.filter(it => it.path === "TestApp.nuspec")[0], {
      path: path.dirname(packageFile),
    })
    const expectedSpec = (await readFile(path.join(path.dirname(packageFile), "TestApp.nuspec"), "utf8")).replace(/\r\n/g, "\n")
    // console.log(expectedSpec)
    assertThat(expectedSpec).isEqualTo(`<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>TestApp</id>
    <version>${convertVersion(appInfo.version)}</version>
    <title>${productName}</title>
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

async function getContents(path: string, productName: string) {
  const result = await exec("dpkg", ["--contents", path])
  return pathSorter(result
    .split("\n")
    .map(it => it.length === 0 ? null : it.substring(it.indexOf(".") + 1))
    .filter(it => it != null && !(it.startsWith(`/opt/${productName}/locales/`) || it.startsWith(`/opt/${productName}/libgcrypt`)))
    )
}

export async function modifyPackageJson(projectDir: string, task: (data: any) => void, isApp: boolean = false): Promise<any> {
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
  packagerOptions.cscLink = CSC_LINK
  packagerOptions.cscKeyPassword = CSC_KEY_PASSWORD
  packagerOptions.cscInstallerLink = CSC_INSTALLER_LINK
  packagerOptions.cscInstallerKeyPassword = CSC_INSTALLER_KEY_PASSWORD
  return packagerOptions
}

export function getPossiblePlatforms(type?: string): Map<Platform, Map<Arch, string[]>> {
  const platforms = [Platform.fromString(process.platform)]
  if (process.platform === Platform.OSX.nodeName) {
    if (process.env.LINUX_SKIP == null) {
      platforms.push(Platform.LINUX)
    }
    if (process.env.CI == null) {
      platforms.push(Platform.WINDOWS)
    }
  }
  else if (process.platform === Platform.LINUX.nodeName && process.env.SKIP_WIN == null) {
    platforms.push(Platform.WINDOWS)
  }
  return createTargets(platforms, type)
}

export function currentPlatform(dist: boolean = true): PackagerOptions {
  return {
    targets: Platform.fromString(process.platform).createTarget(dist ? null : DIR_TARGET),
  }
}