import { copy, emptyDir, remove, writeJson, readJson, readFile } from "fs-extra-p"
import * as assertThat from "should/as-function"
import * as path from "path"
import { parse as parsePlist } from "plist"
import { CSC_LINK, CSC_KEY_PASSWORD } from "./codeSignData"
import { expectedLinuxContents, expectedWinContents } from "./expectedContents"
import { readText } from "out/promisifed-fs"
import { Packager, PackagerOptions, Platform, getProductName, ArtifactCreated } from "out"
import { normalizePlatforms } from "out/packager"
import { exec } from "out/util"
import pathSorter = require("path-sort")
import { tmpdir } from "os"
import DecompressZip = require("decompress-zip")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

const tmpDirPrefix = "electron-builder-test-" + process.pid + "-"
let tmpDirCounter = 0

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

export const outDirName = "dist"

interface AssertPackOptions {
  readonly tempDirCreated?: (projectDir: string) => Promise<any>
  readonly packed?: (projectDir: string) => Promise<any>
  readonly expectedContents?: Array<string>
}

export async function assertPack(fixtureName: string, packagerOptions: PackagerOptions, checkOptions?: AssertPackOptions): Promise<void> {
  const tempDirCreated = checkOptions == null ? null : checkOptions.tempDirCreated
  const useTempDir = tempDirCreated != null || packagerOptions.target != null

  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  const customTmpDir = process.env.TEST_APP_TMP_DIR
  if (useTempDir) {
    // non-osx test uses the same dir as osx test, but we cannot share node_modules (because tests executed in parallel)
    const dir = customTmpDir == null ? path.join(tmpdir(), tmpDirPrefix + fixtureName + "-" + tmpDirCounter++) : path.resolve(customTmpDir)
    if (customTmpDir != null) {
      console.log("Custom temp dir used: %s", customTmpDir)
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
      cscLink: CSC_LINK,
      cscKeyPassword: CSC_KEY_PASSWORD,
      dist: true,
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
    assertThat(path.isAbsolute(event.file)).true()
    let list = artifacts.get(event.platform)
    if (list == null) {
      list = []
      artifacts.set(event.platform, list)
    }
    list.push(event)
  })

  await packager.build()

  if (!packagerOptions.dist || packagerOptions.platformPackagerFactory != null) {
    return
  }

  for (let platform of normalizePlatforms(packagerOptions.platform)) {
    if (platform === "darwin") {
      await checkOsXResult(packager, artifacts.get(Platform.OSX))
    }
    else if (platform === "linux") {
      await checkLinuxResult(projectDir, packager, packagerOptions)
    }
    else if (platform === "win32") {
      await checkWindowsResult(packager, packagerOptions, checkOptions, artifacts.get(Platform.WINDOWS))
    }
  }
}

async function checkLinuxResult(projectDir: string, packager: Packager, packagerOptions: PackagerOptions) {
  const productName = getProductName(packager.metadata, packager.devMetadata)
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

  const packageFile = `${projectDir}/${outDirName}/TestApp-1.1.0-amd64.deb`
  assertThat(await getContents(packageFile, productName)).deepEqual(expectedContents)
  if (packagerOptions.arch === "all" || packagerOptions.arch === "ia32") {
    assertThat(await getContents(`${projectDir}/${outDirName}/TestApp-1.1.0-i386.deb`, productName)).deepEqual(expectedContents)
  }

  const regexp = /^ *(\w+): *(.+)$/gm
  const info = (await exec("dpkg", ["--info", packageFile])).toString()
  let match: Array<string>
  const metadata: any = {}
  while ((match = regexp.exec(info)) !== null) {
    metadata[match[1]] = match[2]
  }
  assertThat(metadata).has.properties({
    License: "MIT",
    Homepage: "http://foo.example.com",
    Maintainer: "Foo Bar <foo@example.com>",
    Package: "testapp",
    Description: "Test Application",
  })
}

async function checkOsXResult(packager: Packager, artifacts: Array<ArtifactCreated>) {
  const productName = getProductName(packager.metadata, packager.devMetadata)
  const packedAppDir = path.join(path.dirname(artifacts[0].file), (productName || packager.metadata.name) + ".app")
  const info = parsePlist(await readText(path.join(packedAppDir, "Contents", "Info.plist")))
  assertThat(info).has.properties({
    CFBundleDisplayName: productName,
    CFBundleIdentifier: "your.id",
    LSApplicationCategoryType: "your.app.category.type",
    CFBundleVersion: "1.1.0" + "." + (process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)
  })

  const result = await exec("codesign", ["--verify", packedAppDir])
  assertThat(result[0].toString()).not.match(/is not signed at all/)

  assertThat(artifacts.map(it => path.basename(it.file)).sort()).deepEqual([
    `${productName}-1.1.0-mac.zip`,
    `${productName}-1.1.0.dmg`,
  ].sort())

  assertThat(artifacts.map(it => it.artifactName).sort()).deepEqual([
    "TestApp-1.1.0-mac.zip",
    "TestApp-1.1.0.dmg",
  ].sort())
}

async function checkWindowsResult(packager: Packager, packagerOptions: PackagerOptions, checkOptions: AssertPackOptions, artifacts: Array<ArtifactCreated>) {
  const productName = getProductName(packager.metadata, packager.devMetadata)

  function getWinExpected(archSuffix: string) {
    return [
      `RELEASES${archSuffix}`,
      `${productName}Setup-1.1.0${archSuffix}.exe`,
      `TestApp-1.1.0${archSuffix}-full.nupkg`,
    ]
  }

  const archSuffix = (packagerOptions.arch || process.arch) === "x64" ? "" : "-ia32"
  const expected = archSuffix == "" ? getWinExpected(archSuffix) : getWinExpected(archSuffix).concat(getWinExpected(""))

  const filenames = artifacts.map(it => path.basename(it.file))
  assertThat(filenames.slice().sort()).deepEqual(expected.slice().sort())

  let i = filenames.indexOf("RELEASES-ia32")
  if (i !== -1) {
    assertThat((await readText(artifacts[i].file)).indexOf("ia32")).not.equal(-1)
  }

  if (archSuffix == "") {
    const expectedArtifactNames = expected.slice()
    expectedArtifactNames[1] = `TestAppSetup-1.1.0${archSuffix}.exe`
    assertThat(artifacts.map(it => it.artifactName).filter(it => it != null)).deepEqual([`TestAppSetup-1.1.0${archSuffix}.exe`])
  }

  const packageFile = path.join(path.dirname(artifacts[0].file), `TestApp-1.1.0${archSuffix}-full.nupkg`)
  const unZipper = new DecompressZip(packageFile)
  const fileDescriptors = await unZipper.getFiles()

  const files = pathSorter(fileDescriptors.map(it => it.path.replace(/\\/g, "/")).filter(it => (!it.startsWith("lib/net45/locales/") || it === "lib/net45/locales/en-US.pak") && !it.endsWith(".psmdcp")))

  // console.log(JSON.stringify(files, null, 2))
  const expectedContents = checkOptions == null || checkOptions.expectedContents == null ? expectedWinContents : checkOptions.expectedContents
  assertThat(files).deepEqual(expectedContents.map(it => {
    if (it === "lib/net45/TestApp.exe") {
      return `lib/net45/${productName.replace(/ /g, "%20")}.exe`
    }
    else {
      return it
    }
  }))

  if (checkOptions == null || checkOptions.expectedContents == null) {
    await unZipper.extractFile(fileDescriptors.filter(it => it.path === "TestApp.nuspec")[0], {
      path: path.dirname(packageFile),
    })
    assertThat((await readFile(path.join(path.dirname(packageFile), "TestApp.nuspec"), "utf8")).replace(/\r\n/g, "\n")).equal(`<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>TestApp</id>
    <version>1.1.0</version>
    <title>${productName}</title>
    <authors>Foo Bar</authors>
    <owners>Foo Bar</owners>
    <projectUrl>http://foo.example.com</projectUrl>
    <iconUrl>https://raw.githubusercontent.com/szwacz/electron-boilerplate/master/resources/windows/icon.ico</iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>Test Application</description>
    <copyright>Copyright © ${new Date().getFullYear()} Foo Bar</copyright>
  </metadata>
</package>`)
  }
}

async function getContents(path: string, productName: string) {
  const result = await exec("dpkg", ["--contents", path])
  return pathSorter(result[0].toString()
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

export function platform(platform: string): PackagerOptions {
  return {
    platform: [platform]
  }
}