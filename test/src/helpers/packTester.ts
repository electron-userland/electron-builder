import { copy, emptyDir, remove } from "fs-extra-p"
import * as assertThat from "should/as-function"
import * as path from "path"
import { parse as parsePlist } from "plist"
import { CSC_LINK, CSC_KEY_PASSWORD } from "./codeSignData"
import { expectedLinuxContents } from "./expectedContents"
import { readText } from "out/promisifed-fs"
import { Packager, PackagerOptions, Platform } from "out"
import { normalizePlatforms } from "out/packager"
import { exec } from "out/util"
import pathSorter = require("path-sort")
import { tmpdir } from "os"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

const tmpDirPrefix = "electron-builder-test-" + process.pid + "-"
let tmpDirCounter = 0

export async function assertPack(fixtureName: string, platform: string | Array<string>, packagerOptions?: PackagerOptions, useTempDir?: boolean, tempDirCreated?: (projectDir: string) => Promise<any>) {
  let projectDir = path.join(__dirname, "..", "..", "fixtures", fixtureName)
  // const isDoNotUseTempDir = platform === "darwin"
  if (useTempDir) {
    // non-osx test uses the same dir as osx test, but we cannot share node_modules (because tests executed in parallel)
    const dir = path.join(tmpdir(), tmpDirPrefix + fixtureName + tmpDirCounter++)
    await emptyDir(dir)
    await copy(projectDir, dir, {
      filter: it => {
        const basename = path.basename(it)
        return basename !== "dist" && basename !== "node_modules" && basename[0] !== "."
      }
    })
    projectDir = dir
  }

  try {
    if (tempDirCreated != null) {
      await tempDirCreated(projectDir)
    }

    const platforms = Array.isArray(platform) ? platform : [platform]
    await packAndCheck(projectDir, platforms, packagerOptions)
  }
  finally {
    if (useTempDir) {
      try {
        await remove(projectDir)
      }
      catch (e) {
        console.warn("Cannot delete temporary directory " + projectDir + ": " + (e.stack || e))
      }
    }
  }
}

async function packAndCheck(projectDir: string, platforms: string[], packagerOptions?: PackagerOptions) {
  const packager = new Packager(Object.assign({
    projectDir: projectDir,
    cscLink: CSC_LINK,
    cscKeyPassword: CSC_KEY_PASSWORD,
    dist: true,
    platform: platforms,
  }, packagerOptions))

  const artifacts: Map<Platform, Array<string>> = new Map()
  packager.artifactCreated((file, platform) => {
    let list = artifacts.get(platform)
    if (list == null) {
      list = []
      artifacts.set(platform, list)
    }
    list.push(path.basename(file))
  })

  await packager.build()

  for (let key of artifacts.keys()) {
    artifacts.set(key, pathSorter(artifacts.get(key)))
  }

  const expandedPlatforms = normalizePlatforms(platforms)
  if (expandedPlatforms.includes("darwin")) {
    await checkOsXResult(projectDir, artifacts.get(Platform.OSX))
  }
  else if (expandedPlatforms.includes("linux")) {
    assertThat(await getContents(projectDir + "/dist/TestApp-1.0.0-amd64.deb")).deepEqual(expectedLinuxContents)
    if (packagerOptions == null || packagerOptions.arch === null || packagerOptions.arch === "ia32") {
      assertThat(await getContents(projectDir + "/dist/TestApp-1.0.0-i386.deb")).deepEqual(expectedLinuxContents)
    }
    // console.log(JSON.stringify(await getContents(projectDir + "/dist/TestApp-1.0.0-amd64.deb"), null, 2))
    // console.log(JSON.stringify(await getContents(projectDir + "/dist/TestApp-1.0.0-i386.deb"), null, 2))
  }
  else if (expandedPlatforms.includes("win32") && (packagerOptions == null || packagerOptions.target == null)) {
    checkWindowsResult(packagerOptions, artifacts.get(Platform.WINDOWS))
  }
}

async function checkOsXResult(projectDir: string, artifacts: Array<string>) {
  const packedAppDir = projectDir + "/dist/TestApp-darwin-x64/TestApp.app"
  const info = parsePlist(await readText(packedAppDir + "/Contents/Info.plist"))
  assertThat(info).has.properties({
    CFBundleDisplayName: "TestApp",
    CFBundleIdentifier: "your.id",
    LSApplicationCategoryType: "your.app.category.type",
    CFBundleVersion: "1.0.0" + "." + (process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)
  })

  const result = await exec("codesign", ["--verify", packedAppDir])
  assertThat(result[0].toString()).not.match(/is not signed at all/)

  assertThat(artifacts).deepEqual(pathSorter([
    "TestApp-1.0.0-mac.zip",
    "TestApp-1.0.0.dmg"
  ]))
}

function checkWindowsResult(packagerOptions: PackagerOptions, artifacts: Array<string>) {
  const expected32 = [
    "RELEASES-ia32",
    "TestApp-1.0.0-full.nupkg",
    "TestAppSetup-1.0.0.exe"
  ]
  const expected64 = [
    "RELEASES",
    "TestAppSetup-1.0.0-x64.exe",
    "TestApp-1.0.0-x64-full.nupkg"
  ]
  const expected = packagerOptions != null && packagerOptions.arch === "x64" ? expected64 : expected32.concat(expected64)
  assertThat(artifacts).deepEqual(pathSorter(expected))
}

async function getContents(path: string) {
  const result = await exec("dpkg", ["--contents", path])
  return pathSorter(result[0].toString()
    .split("\n")
    .map(it => it.length === 0 ? null : it.substring(it.indexOf(".") + 1))
    .filter(it => it != null && !(it.startsWith("/opt/TestApp/locales/") || it.startsWith("/opt/TestApp/libgcrypt")))
    )
}