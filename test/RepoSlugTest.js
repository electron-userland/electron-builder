import { InfoRetriever } from "../out/repositoryInfo"
import assertThat from "should/as-function"
import test from "ava-tf"

test("repo slug from TRAVIS_REPO_SLUG", function () {
  const oldValue = process.env.TRAVIS_REPO_SLUG
  try {
    process.env.TRAVIS_REPO_SLUG = "travis-ci/travis-build"
    const info = (new InfoRetriever()).getInfo({devMetadata: {}, metadata: {}}).value()
    assertThat(info).has.properties({
      user: "travis-ci",
      project: "travis-build",
    })
  }
  finally {
    if (oldValue != null) {
      restoreEnv("TRAVIS_REPO_SLUG", oldValue)
    }
  }
})

function restoreEnv(name, value) {
  if (value != null) {
    // otherwise will be set to string value "undefined"
    process.env[name] = value
  }
}

test("repo slug from APPVEYOR", function () {
  const oldAppveyorAccountName = process.env.APPVEYOR_ACCOUNT_NAME
  const oldAppveyorProjectName = process.env.APPVEYOR_PROJECT_NAME
  const travisSlug = process.env.TRAVIS_REPO_SLUG
  try {
    if (travisSlug != null) {
      delete process.env.TRAVIS_REPO_SLUG
    }

    process.env.APPVEYOR_ACCOUNT_NAME = "travis-ci"
    process.env.APPVEYOR_PROJECT_NAME = "travis-build"
    const info = (new InfoRetriever()).getInfo({devMetadata: {}, metadata: {}}).value()
    assertThat(info).has.properties({
      user: "travis-ci",
      project: "travis-build",
    })
  }
  finally {
    restoreEnv("APPVEYOR_ACCOUNT_NAME", oldAppveyorAccountName)
    restoreEnv("APPVEYOR_PROJECT_NAME", oldAppveyorProjectName)
    if (travisSlug != null) {
      process.env.TRAVIS_REPO_SLUG = travisSlug
    }
  }
})