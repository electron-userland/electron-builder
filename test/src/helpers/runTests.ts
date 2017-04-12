import BluebirdPromise from "bluebird-lst"
import { emptyDir, readdir, readJson, removeSync, unlink } from "fs-extra-p"
import isCi from "is-ci"
import { homedir } from "os"
import * as path from "path"
import { ELECTRON_VERSION, TEST_DIR } from "./config"

// we set NODE_PATH in this file, so, we cannot use 'out/util' path here
const util = require("../../../packages/electron-builder-util/out/util")
const isEmptyOrSpaces = util.isEmptyOrSpaces

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

runTests()
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

async function deleteOldElectronVersion(): Promise<any> {
  if (!isCi) {
    return
  }

  const cacheDir = path.join(homedir(), ".electron")
  try {
    const deletePromises: Array<Promise<any>> = []
    for (const file of (await readdir(cacheDir))) {
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
  for (const platform of platforms) {
    const archs = (platform === "mas" || platform === "darwin") ? ["x64"] : (platform === "win32" ? ["ia32", "x64"] : ["ia32", "x64", "armv7l"])
    for (const arch of archs) {
      versions.push({
        version: ELECTRON_VERSION,
        arch: arch,
        platform: platform,
      })
    }
  }
  return BluebirdPromise.map(versions, it => downloadElectron(it), {concurrency: 3})
}

async function runTests() {
  await BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    emptyDir(TEST_DIR),
  ])

  const testFiles: string | null = process.env.TEST_FILES

  const args = []
  const baseForLinuxTests = ["ArtifactPublisherTest.js", "httpRequestTest.js", "RepoSlugTest.js"]
  if (!isEmptyOrSpaces(testFiles)) {
    args.push(...testFiles.split(",").map(it => `${it.trim()}.js`))
    if (process.platform === "linux") {
      args.push(...baseForLinuxTests)
    }
  }
  else if (!isEmptyOrSpaces(process.env.CIRCLE_NODE_INDEX)) {
    const circleNodeIndex = parseInt(process.env.CIRCLE_NODE_INDEX, 10)
    if (circleNodeIndex === 0) {
      args.push("debTest")
      args.push("fpmTest")
    }
    else if (circleNodeIndex === 1) {
      args.push("BuildTest", "extraMetadataTest", "mainEntryTest", "globTest", "filesTest", "ignoreTest", "nsisUpdaterTest")
      args.push("mac.+")
      args.push(...baseForLinuxTests)
    }
    else if (circleNodeIndex === 2) {
      args.push("snapTest")
    }
    else {
      args.push("windows.*", "linuxArchiveTest")
    }
    console.log(`Test files for node ${circleNodeIndex}: ${args.join(", ")}`)
  }

  process.env.TEST_DIR = TEST_DIR

  const rootDir = path.join(__dirname, "..", "..", "..")

  const config = (await readJson(path.join(rootDir, "package.json"))).jest
  // use custom cache dir to avoid https://github.com/facebook/jest/issues/1903#issuecomment-261212137
  config.cacheDirectory = process.env.JEST_CACHE_DIR || "/tmp/jest-electron-builder-tests"
  // no need to transform — compiled before
  config.transformIgnorePatterns = [".*"]
  config.bail = process.env.TEST_BAIL === "true"

  let runInBand = false
  const scriptArgs = process.argv.slice(2)

  const testPathIgnorePatterns = config.testPathIgnorePatterns
  if (scriptArgs.length > 0) {
    for (const scriptArg of scriptArgs) {
      console.log(`custom opt: ${scriptArg}`)
      if ("runInBand" === scriptArg) {
        runInBand = true
      }
      else if (scriptArg.includes("=")) {
        const equalIndex = scriptArg.indexOf("=")
        const envName = scriptArg.substring(0, equalIndex)
        let envValue = scriptArg.substring(equalIndex + 1)
        if (envValue === "isCi") {
          envValue = isCi ? "true" : "false"
        }

        process.env[envName] = envValue
        console.log(`Custom env ${envName}=${envValue}`)

        if (envName === "ALL_TESTS" && envValue === "false") {
          config.cacheDirectory += "-basic"
        }
      }
      else if (scriptArg.startsWith("skip")) {
        if (!isCi) {
          const suffix = scriptArg.substring("skip".length)
          switch (scriptArg) {
            case "skipArtifactPublisher": {
              testPathIgnorePatterns.push("[\\/]{1}ArtifactPublisherTest.js$")
              config.cacheDirectory += `-${suffix}`
            }
            break

            default:
              throw new Error(`Unknown opt ${scriptArg}`)
          }
        }
      }
      else {
        config[scriptArg] = true
      }
    }
  }

  if (process.env.CIRCLECI != null) {
    config.testResultsProcessor = "<rootDir>/node_modules/jest-junit"
    process.env.JEST_JUNIT_OUTPUT = path.join(process.env.CIRCLE_TEST_REPORTS == null ? path.join(__dirname, "..", "..") : path.join(process.env.CIRCLE_TEST_REPORTS, "reports"), "test-report.xml")
  }

  require("jest-cli").runCLI({
    verbose: true,
    updateSnapshot: process.env.UPDATE_SNAPSHOT === "true",
    config: config,
    runInBand: runInBand,
    testPathPattern: args.length > 0 ? args.join("|") : null,
  }, rootDir, (result: any) => {
    const code = !result || result.success ? 0 : 1
    removeSync(TEST_DIR)
    process.exitCode = code
    process.on("exit", () => {
      return process.exit(code)
    })
  })
}