import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { emptyDir, readdir, unlink, removeSync, readJson } from "fs-extra-p"
import { homedir } from "os"
import { TEST_DIR, ELECTRON_VERSION } from "./config"

// we set NODE_PATH in this file, so, we cannot use 'out/awaiter' path here
const util = require("../../../out/util/util")
const isEmptyOrSpaces = util.isEmptyOrSpaces

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

async function main() {
  const testDir = TEST_DIR
  await BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    emptyDir(testDir),
  ])

  const exitHandler = () => {
    removeSync(testDir)
  }
  process.on("SIGINT", exitHandler)
  process.on("exit", exitHandler)
  await runTests()
}

main()
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

async function deleteOldElectronVersion(): Promise<any> {
  if (!process.env.CI) {
    return
  }

  const cacheDir = path.join(homedir(), ".electron")
  try {
    const deletePromises: Array<Promise<any>> = []
    for (let file of (await readdir(cacheDir))) {
      if (file.endsWith(".zip") && !file.includes(ELECTRON_VERSION)) {
        console.log(`Remove old electron ${file}`)
        deletePromises.push(unlink(path.join(cacheDir, file)))
      }
    }
    return await BluebirdPromise.all(deletePromises)
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return []
    }
    else {
      throw e
    }
  }
}

function downloadAllRequiredElectronVersions(): Promise<any> {
  const platforms = process.platform === "win32" ? ["win32"] : ["darwin", "linux", "win32"]
  if (process.platform === "darwin") {
    platforms.push("mas")
  }

  const versions: Array<any> = []
  for (let platform of platforms) {
    const archs = (platform === "mas" || platform === "darwin") ? ["x64"] : (platform === "win32" ? ["ia32", "x64"] : ["ia32", "x64", "armv7l"])
    for (let arch of archs) {
      versions.push({
        version: ELECTRON_VERSION,
        arch: arch,
        platform: platform,
      })
    }
  }
  return BluebirdPromise.map(versions, it => downloadElectron(it), {concurrency: 3})
}

/**
 * CIRCLE_NODE_INDEX=2 — test nodejs 4 (on Circle).
 */
async function runTests() {
  const testFiles: string | null = process.env.TEST_FILES

  const args = []
  const baseForLinuxTests = ["ArtifactPublisherTest.js", "httpRequestTest.js", "RepoSlugTest.js"]
  let skipWin = false
  if (!isEmptyOrSpaces(testFiles)) {
    args.push(...testFiles.split(",").map(it => `${it.trim()}.js`))
    if (process.platform === "linux") {
      args.push(...baseForLinuxTests)
    }
  }
  else if (!isEmptyOrSpaces(process.env.CIRCLE_NODE_INDEX)) {
    const circleNodeIndex = parseInt(process.env.CIRCLE_NODE_INDEX, 10)
    if (circleNodeIndex === 0 || circleNodeIndex === 2) {
      skipWin = true
      args.push("linux.*", "BuildTest.js", "extraMetadataTest.js", "mainEntryTest.js", "globTest.js", "filesTest.js", "ignoreTest.js")
    }
    else {
      args.push("windows.*", "mac.*")
      args.push(...baseForLinuxTests)
    }
    console.log(`Test files for node ${circleNodeIndex}: ${args.join(", ")}`)
  }

  process.env.SKIP_WIN = skipWin
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
  process.env.TEST_DIR = TEST_DIR

  const rootDir = path.join(__dirname, "..", "..", "..")

  const config = (await readJson(path.join(rootDir, "package.json"))).jest
  // use custom cache dir to avoid https://github.com/facebook/jest/issues/1903#issuecomment-261212137
  config.cacheDirectory = process.env.JEST_CACHE_DIR || "/tmp/jest-electron-builder-tests"
  // no need to transform — compiled before
  config.transformIgnorePatterns = [".*"]

  require("jest-cli").runCLI({
    verbose: true,
    config: config,
    bail: process.env.TEST_BAIL === "true",
    runInBand: process.env.RUN_IN_BAND === "true",
    testPathPattern: args.length > 0 ? args.join("|") : null,
  }, rootDir, (result: any) => {
    const code = !result || result.success ? 0 : 1
    process.on("exit", () => process.exit(code))
  })
}
