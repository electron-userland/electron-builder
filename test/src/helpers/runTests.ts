import { createHash } from "crypto"
import { emptyDir, readJson, realpathSync, remove } from "fs-extra"
import { isCI as isCi } from "ci-info"
import { tmpdir } from "os"
import * as path from "path"
import { deleteOldElectronVersion, downloadAllRequiredElectronVersions } from "./downloadElectron"

const baseDir = process.env.APP_BUILDER_TMP_DIR || realpathSync(tmpdir())
const APP_BUILDER_TMP_DIR = path.join(baseDir, `et-${createHash("md5").update(__dirname).digest("hex")}`)

runTests()
  .catch(error => {
    console.error(error.stack || error)
    process.exit(1)
  })

async function runTests() {
  process.env.BABEL_JEST_SKIP = "true"

  if (process.env.CIRCLECI) {
    await emptyDir(APP_BUILDER_TMP_DIR)
  }
  else {
    await Promise.all([
      deleteOldElectronVersion(),
      downloadAllRequiredElectronVersions(),
      emptyDir(APP_BUILDER_TMP_DIR),
    ])
  }

  const testFiles = process.env.TEST_FILES

  const testPatterns: Array<string> = []
  if (testFiles != null && testFiles.length !== 0) {
    testPatterns.push(...testFiles.split(","))
  }
  else if (process.env.CIRCLE_NODE_INDEX != null && process.env.CIRCLE_NODE_INDEX.length !== 0) {
    const circleNodeIndex = parseInt(process.env.CIRCLE_NODE_INDEX!!, 10)
    if (circleNodeIndex === 0) {
      testPatterns.push("debTest")
      testPatterns.push("fpmTest")
      testPatterns.push("winPackagerTest")
      testPatterns.push("winCodeSignTest")
      testPatterns.push("squirrelWindowsTest")
      testPatterns.push("nsisUpdaterTest")
      testPatterns.push("macArchiveTest")
      testPatterns.push("macCodeSignTest")
      testPatterns.push("extraMetadataTest")
      testPatterns.push("HoistedNodeModuleTest")
      testPatterns.push("configurationValidationTest")
      testPatterns.push("webInstallerTest")
    }
    else if (circleNodeIndex === 1) {
      testPatterns.push("oneClickInstallerTest")
    }
    else if (circleNodeIndex === 2) {
      testPatterns.push("snapTest")
      testPatterns.push("macPackagerTest")
      testPatterns.push("linuxPackagerTest")
      testPatterns.push("msiTest")
      testPatterns.push("ignoreTest")
      testPatterns.push("mainEntryTest")
      testPatterns.push("ArtifactPublisherTest")
      testPatterns.push("RepoSlugTest")
      testPatterns.push("portableTest")
      testPatterns.push("globTest")
      testPatterns.push("BuildTest")
      testPatterns.push("linuxArchiveTest")
    }
    else {
      testPatterns.push("PublishManagerTest")
      testPatterns.push("assistedInstallerTest")
      testPatterns.push("filesTest")
      testPatterns.push("protonTest")
    }
    console.log(`Test files for node ${circleNodeIndex}: ${testPatterns.join(", ")}`)
  }

  process.env.APP_BUILDER_TMP_DIR = APP_BUILDER_TMP_DIR

  const rootDir = path.join(__dirname, "..", "..")

  process.chdir(rootDir)

  const config = (await readJson(path.join(rootDir, "package.json"))).jest
  // use custom cache dir to avoid https://github.com/facebook/jest/issues/1903#issuecomment-261212137
  config.cacheDirectory = process.env.JEST_CACHE_DIR || "/tmp/jest-electron-builder-tests"
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
          if (scriptArg === "skipArtifactPublisher") {
            testPathIgnorePatterns.push("[\\/]{1}ArtifactPublisherTest.js$")
            config.cacheDirectory += `-${suffix}`
          }
          else {
            throw new Error(`Unknown opt ${scriptArg}`)
          }
        }
      }
      else {
        config[scriptArg] = true
      }
    }
  }

  const jestOptions: any = {
    verbose: true,
    updateSnapshot: process.env.UPDATE_SNAPSHOT === "true",
    config,
    runInBand,
    projects: [rootDir],
  }

  if (testPatterns.length > 0) {
    jestOptions.testPathPattern = testPatterns
      .map(it => it.endsWith(".ts") || it.endsWith("*") ? it : `${it}\\.ts$`)
  }
  if (process.env.CIRCLECI != null || process.env.TEST_JUNIT_REPORT === "true") {
    jestOptions.reporters = ["default", "jest-junit"]
  }

  // console.log(JSON.stringify(jestOptions, null, 2))

  const testResult = await require("@jest/core").runCLI(jestOptions, jestOptions.projects)
  const exitCode = testResult.results == null || testResult.results.success ? 0 : testResult.globalConfig.testFailureExitCode
  if (isCi) {
    process.exit(exitCode)
  }

  await remove(APP_BUILDER_TMP_DIR)
  process.exitCode = exitCode
  if (testResult.globalConfig.forceExit) {
    process.exit(exitCode)
  }
}