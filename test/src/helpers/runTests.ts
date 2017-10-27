import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { emptyDir, readJson, remove } from "fs-extra-p"
import isCi from "is-ci"
import { tmpdir } from "os"
import * as path from "path"
import { deleteOldElectronVersion, downloadAllRequiredElectronVersions } from "./downloadElectron"

const rootDir = path.join(__dirname, "../../..")

// we set NODE_PATH in this file, so, we cannot use 'out/util' path here
const util = require(`${rootDir}/packages/builder-util/out/util`)
const isEmptyOrSpaces = util.isEmptyOrSpaces

const baseDir = process.env.ELECTRON_BUILDER_TEST_DIR || (process.platform === "darwin" && !require("is-ci") ? "/tmp" : tmpdir())
const TEST_TMP_DIR = path.join(baseDir, `et-${createHash("md5").update(__dirname).digest("hex")}`)

runTests()
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

async function runTests() {
  if (process.env.CIRCLECI) {
    await emptyDir(TEST_TMP_DIR)
  }
  else {
    await BluebirdPromise.all([
      deleteOldElectronVersion(),
      downloadAllRequiredElectronVersions(),
      emptyDir(TEST_TMP_DIR),
    ])
  }

  const testFiles: string | null | undefined = process.env.TEST_FILES

  const args = []
  if (!isEmptyOrSpaces(testFiles)) {
    args.push(...testFiles!!.split(",").map(it => `${it.trim()}.js`))
  }
  else if (!isEmptyOrSpaces(process.env.CIRCLE_NODE_INDEX)) {
    const circleNodeIndex = parseInt(process.env.CIRCLE_NODE_INDEX!!, 10)
    if (circleNodeIndex === 0) {
      args.push("debTest")
      args.push("fpmTest")
      args.push("winPackagerTest")
      args.push("winCodeSignTest")
      args.push("squirrelWindowsTest")
      args.push("nsisUpdaterTest")
      args.push("macArchiveTest")
      args.push("macCodeSignTest")
      args.push("extraMetadataTest")
    }
    else if (circleNodeIndex === 1) {
      args.push("oneClickInstallerTest")
    }
    else if (circleNodeIndex === 2) {
      args.push("snapTest")
      args.push("configurationValidationTest")
      args.push("mainEntryTest")
      args.push("PublishManagerTest", "ArtifactPublisherTest", "httpRequestTest", "RepoSlugTest")
      args.push("macPackagerTest")
      args.push("portableTest")
      args.push("linuxPackagerTest")
      args.push("ignoreTest")
      args.push("HoistedNodeModuleTest")
    }
    else {
      args.push("BuildTest")
      args.push("assistedInstallerTest")
      args.push("linuxArchiveTest")
      args.push("filesTest")
      args.push("globTest")
      args.push("webInstallerTest")
      args.push("msiTest")
    }
    console.log(`Test files for node ${circleNodeIndex}: ${args.join(", ")}`)
  }

  process.env.TEST_TMP_DIR = TEST_TMP_DIR

  const rootDir = path.join(__dirname, "..", "..", "..")

  const config = (await readJson(path.join(rootDir, "package.json"))).jest
  // use custom cache dir to avoid https://github.com/facebook/jest/issues/1903#issuecomment-261212137
  config.cacheDirectory = process.env.JEST_CACHE_DIR || "/tmp/jest-electron-builder-tests"
  // no need to transform — compiled before
  config.transform = {}
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
              // noinspection TsLint
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

  const jestArgs: any = {
    verbose: true,
    updateSnapshot: process.env.UPDATE_SNAPSHOT === "true",
    config,
    runInBand,
  }
  if (args.length > 0) {
    jestArgs.testPathPattern = args.join("|")
  }
  if (process.env.CIRCLECI != null || process.env.TEST_JUNIT_REPORT === "true") {
    jestArgs.testResultsProcessor = "jest-junit"
  }

  const testResult = await require("jest-cli").runCLI(jestArgs, [rootDir])
  const exitCode = testResult.results == null || testResult.results.success ? 0 : testResult.globalConfig.testFailureExitCode
  if (isCi) {
    process.exit(exitCode)
  }

  await remove(TEST_TMP_DIR)
  process.exitCode = exitCode
  if (testResult.globalConfig.forceExit) {
    process.exit(exitCode)
  }
}