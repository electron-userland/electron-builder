import { createHash } from "crypto"
import { readJson, realpathSync } from "fs-extra"
import * as fs from "fs/promises"
import { isCI as isCi } from "ci-info"
import { tmpdir } from "os"
import * as path from "path"
import { deleteOldElectronVersion, downloadAllRequiredElectronVersions } from "./downloadElectron"

const baseDir = process.env.APP_BUILDER_TMP_DIR || realpathSync(tmpdir())
const APP_BUILDER_TMP_DIR = path.join(baseDir, `et-${createHash("md5").update(__dirname).digest("hex")}`)

runTests().catch(error => {
  console.error(error.stack || error)
  process.exit(1)
})

async function runTests() {
  await fs.rm(APP_BUILDER_TMP_DIR, { recursive: true, force: true })
  await fs.mkdir(APP_BUILDER_TMP_DIR, { recursive: true })
  if (!process.env.CIRCLECI) {
    await Promise.all([deleteOldElectronVersion(), downloadAllRequiredElectronVersions()])
  }

  const testFiles = process.env.TEST_FILES

  const testPatterns: Array<string> = []
  if (testFiles != null && testFiles.length !== 0) {
    console.log(`Test files: ${testFiles}`)
    testPatterns.push(...testFiles.split(","))
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
      } else if (scriptArg.includes("=")) {
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
      } else if (scriptArg.startsWith("skip")) {
        if (!isCi) {
          const suffix = scriptArg.substring("skip".length)
          if (scriptArg === "skipArtifactPublisher") {
            testPathIgnorePatterns.push("[\\/]{1}ArtifactPublisherTest.js$")
            config.cacheDirectory += `-${suffix}`
          } else {
            throw new Error(`Unknown opt ${scriptArg}`)
          }
        }
      } else {
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
    jestOptions.testPathPattern = testPatterns.map(it => (it.endsWith(".ts") || it.endsWith("*") ? it : `${it}\\.ts$`))
  }
  if (process.env.CIRCLECI != null || process.env.TEST_JUNIT_REPORT === "true") {
    jestOptions.reporters = ["default", "jest-junit"]
  }

  const testResult = await require("@jest/core").runCLI(jestOptions, jestOptions.projects)
  const exitCode = testResult.results == null || testResult.results.success ? 0 : testResult.globalConfig.testFailureExitCode
  if (isCi) {
    process.exit(exitCode)
  }

  await fs.rm(APP_BUILDER_TMP_DIR, { recursive: true, force: true })
  process.exitCode = exitCode
  if (testResult.globalConfig.forceExit) {
    process.exit(exitCode)
  }
}
