import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { emptyDir, readdir, readJson, remove, unlink } from "fs-extra-p"
import isCi from "is-ci"
import { tmpdir } from "os"
import * as path from "path"
import { ELECTRON_VERSION } from "./testConfig"

const rootDir = path.join(__dirname, "../../..")

// we set NODE_PATH in this file, so, we cannot use 'out/util' path here
const util = require(`${rootDir}/packages/builder-util/out/util`)
const isEmptyOrSpaces = util.isEmptyOrSpaces

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

const baseDir = process.env.ELECTRON_BUILDER_TEST_DIR || (process.platform === "darwin" && !require("is-ci") ? "/tmp" : tmpdir())
const TEST_TMP_DIR = path.join(baseDir, `et-${createHash("md5").update(__dirname).digest("hex")}`)

runTests()
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

async function deleteOldElectronVersion(): Promise<any> {
  if (!isCi) {
    return
  }

  const cacheDir = require("env-paths")("electron", {suffix: ""}).cache
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
        arch,
        platform,
      })
    }
  }
  return BluebirdPromise.map(versions, it => downloadElectron(it), {concurrency: 3})
}

async function runTests() {
  await BluebirdPromise.all([
    deleteOldElectronVersion(),
    downloadAllRequiredElectronVersions(),
    emptyDir(TEST_TMP_DIR),
  ])

  const testFiles: string | null | undefined = process.env.TEST_FILES

  const args = []
  const baseForLinuxTests = ["ArtifactPublisherTest.js", "httpRequestTest.js", "RepoSlugTest.js"]
  if (!isEmptyOrSpaces(testFiles)) {
    args.push(...testFiles!!.split(",").map(it => `${it.trim()}.js`))
    if (process.platform === "linux") {
      args.push(...baseForLinuxTests)
    }
  }
  else if (!isEmptyOrSpaces(process.env.CIRCLE_NODE_INDEX)) {
    const circleNodeIndex = parseInt(process.env.CIRCLE_NODE_INDEX!!, 10)
    if (circleNodeIndex === 0) {
      args.push("debTest")
      args.push("fpmTest")
      args.push("oneClickInstallerTest")
      args.push("winPackagerTest")
    }
    else if (circleNodeIndex === 1) {
      args.push("BuildTest", "extraMetadataTest", "mainEntryTest", "globTest", "filesTest", "ignoreTest", "nsisUpdaterTest", "PublishManagerTest")
      args.push("mac.+")
      args.push("squirrelWindowsTest")
      args.push(...baseForLinuxTests)
    }
    else if (circleNodeIndex === 2) {
      args.push("snapTest")
    }
    else {
      args.push("installerTest", "portableTest")
      args.push("linuxArchiveTest")
    }
    console.log(`Test files for node ${circleNodeIndex}: ${args.join(", ")}`)
  }

  process.env.TEST_TMP_DIR = TEST_TMP_DIR

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
    config.testResultsProcessor = "jest-junit"
    process.env.JEST_JUNIT_OUTPUT = path.join(rootDir, "test-reports", "test-report.xml")
  }

  require("jest-cli").runCLI({
    verbose: true,
    updateSnapshot: process.env.UPDATE_SNAPSHOT === "true",
    config,
    runInBand,
    testPathPattern: args.length > 0 ? args.join("|") : null,
  }, [rootDir], (result: any) => {
    const exitCode = !result || result.success ? 0 : 1
    process.exitCode = exitCode
    remove(TEST_TMP_DIR)
      .catch(e => {
        console.error(e.stack)
      })

    // strange, without this code process exit code always 0
    if (exitCode > 0) {
      process.on("exit", () => process.exit(exitCode))
    }
  })
}