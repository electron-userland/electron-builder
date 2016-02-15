import test from "ava-tf"
import fse from "fs-extra"
import tmp from "tmp"
import Promise from "bluebird"
import assertThat from "should/as-function"
import * as path from "path"
import { parse as parsePlist } from "plist"
import { Packager } from "../out/packager"
import { exec } from "../out/util"
import { deleteDirectory, readFile } from "../out/promisifed-fs"
import { CSC_LINK, CSC_KEY_PASSWORD } from "./helpers/codeSignData"

const copyDir = Promise.promisify(fse.copy)
const tmpDir = Promise.promisify(tmp.dir)

const expectedLinuxContents = [ '/',
  '/opt/',
  '/opt/TestApp/',
  '/opt/TestApp/LICENSE',
  '/opt/TestApp/LICENSES.chromium.html',
  '/opt/TestApp/TestApp',
  '/opt/TestApp/content_shell.pak',
  '/opt/TestApp/icudtl.dat',
  '/opt/TestApp/libnode.so',
  '/opt/TestApp/natives_blob.bin',
  '/opt/TestApp/pkgtarget',
  '/opt/TestApp/resources/',
  '/opt/TestApp/resources/app.asar',
  '/opt/TestApp/resources/atom.asar',
  '/opt/TestApp/snapshot_blob.bin',
  '/opt/TestApp/version',
  '/usr/',
  '/usr/share/',
  '/usr/share/applications/',
  '/usr/share/applications/TestApp.desktop',
  '/usr/share/doc/',
  '/usr/share/doc/testapp/',
  '/usr/share/doc/testapp/changelog.Debian.gz',
  '/usr/share/icons/',
  '/usr/share/icons/hicolors/' ]

async function assertPack(projectDir, platform) {
  projectDir = path.join(__dirname, "fixtures", projectDir)
  // const isDoNotUseTempDir = platform === "darwin"
  const isDoNotUseTempDir = true
  if (!isDoNotUseTempDir) {
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
  }

  const packager = new Packager({
    projectDir: projectDir,
    cscLink: CSC_LINK,
    cscKeyPassword: CSC_KEY_PASSWORD,
    dist: true,
    platform: platform,
  })

  await packager.build()
  if (platform === "darwin") {
    const packedAppDir = projectDir + "/dist/TestApp-darwin-x64/TestApp.app"
    const info = parsePlist(await readFile(packedAppDir + "/Contents/Info.plist", "utf8"))
    assertThat(info).has.properties({
      CFBundleDisplayName: "TestApp",
      CFBundleIdentifier: "your.id",
      LSApplicationCategoryType: "your.app.category.type",
      CFBundleVersion: "1.0.0" + "." + (process.env.TRAVIS_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM)
    })

    const result = await exec("codesign", ["--verify", packedAppDir])
    assertThat(result[0].toString()).not.match(/is not signed at all/)
  }
  else if (platform === "linux") {
    assertThat(await getContents(projectDir + "/dist/TestApp-1.0.0-amd64.deb")).deepEqual(expectedLinuxContents)
    assertThat(await getContents(projectDir + "/dist/TestApp-1.0.0-i386.deb")).deepEqual(expectedLinuxContents)
    // console.log(await getContents(projectDir + "/dist/TestApp-1.0.0-amd64.deb"))
    // console.log(await getContents(projectDir + "/dist/TestApp-1.0.0-i386.deb"))
  }
}

async function getContents(path) {
  const result = await exec("dpkg", ["--contents", path])
  return result[0]
    .split("\n")
    .map(it => it.length === 0 ? null : it.substring(it.indexOf('.') + 1))
    .filter(it => it != null && !(it.startsWith("/opt/TestApp/locales/") || it.startsWith("/opt/TestApp/libgcrypt")))
    .sort()
}

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

if (process.platform === "darwin") {
  test("mac: two-package.json", async function () {
    await assertPack("test-app", "darwin")
  })

  test("mac: one-package.json", async function () {
    await assertPack("test-app-one", "darwin")
  })
}

if (process.platform !== "win32") {
  test("linux", async function () {
    await assertPack("test-app-one", "linux")
  })
}

if (!process.env.TRAVIS) {
  test("win", async function () {
    await assertPack("test-app-one", "win32")
  })
}
