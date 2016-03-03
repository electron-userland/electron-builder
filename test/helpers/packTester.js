import fse from "fs-extra"
import tmp from "tmp"
import Promise from "bluebird"
import assertThat from "should/as-function"
import * as path from "path"
import { parse as parsePlist } from "plist"
import { CSC_LINK, CSC_KEY_PASSWORD } from "./codeSignData"
import { expectedLinuxContents } from "./expectedContents"
import { readText } from "out/promisifed-fs"
import { Packager } from "out/index"
import { normalizePlatforms } from "out/packager"
import { exec } from "out/util"
import pathSorter from "path-sort"

const copyDir = Promise.promisify(fse.copy)
const tmpDir = Promise.promisify(tmp.dir)

export async function assertPack(projectDir, platform, packagerOptions, useTempDir, tempDirCreated) {
  projectDir = path.join(__dirname, "..", "fixtures", projectDir)
  // const isDoNotUseTempDir = platform === "darwin"
  if (useTempDir) {
    // non-osx test uses the same dir as osx test, but we cannot share node_modules (because tests executed in parallel)
    const dir = await tmpDir({
      unsafeCleanup: true,
      prefix: platform
    })
    await copyDir(projectDir, dir, {
      filter: function (p) {
        const basename = path.basename(p)
        return basename !== "dist" && basename !== "node_modules" && basename[0] !== "."
      }
    })
    projectDir = dir

    if (tempDirCreated != null) {
      await tempDirCreated(projectDir)
    }
  }

  const platforms = Array.isArray(platform) ? platform : [platform]
  const packager = new Packager(Object.assign({
    projectDir: projectDir,
    cscLink: CSC_LINK,
    cscKeyPassword: CSC_KEY_PASSWORD,
    dist: true,
    platform: platforms,
  }, packagerOptions))

  let artifacts = []
  packager.artifactCreated(it => {
    artifacts.push(path.basename(it))
  })

  await packager.build()

  artifacts = pathSorter(artifacts)
  const expandedPlatforms = normalizePlatforms(platforms)

  if (expandedPlatforms.includes("darwin")) {
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
    let expected
    if (packagerOptions != null && packagerOptions.arch === "x64") {
      expected = expected64
    }
    else {
      expected = expected32.concat(expected64)
    }
    assertThat(artifacts).deepEqual(pathSorter(expected))
  }
}

async function getContents(path) {
  const result = await exec("dpkg", ["--contents", path])
  return pathSorter(result[0]
    .split("\n")
    .map(it => it.length === 0 ? null : it.substring(it.indexOf(".") + 1))
    .filter(it => it != null && !(it.startsWith("/opt/TestApp/locales/") || it.startsWith("/opt/TestApp/libgcrypt")))
    )
}