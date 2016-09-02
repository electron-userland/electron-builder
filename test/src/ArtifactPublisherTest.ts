import test from "./helpers/avaEx"
import { GitHubPublisher } from "out/publish/gitHubPublisher"
import { HttpError } from "out/publish/restApiRequest"
import { join } from "path"
import { assertThat } from "./helpers/fileAssert"
import { BintrayPublisher } from "out/publish/BintrayPublisher"
import { createPublisher } from "out/builder"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function versionNumber() {
  return `${getRandomInt(0, 99)}.${getRandomInt(0, 99)}.${getRandomInt(0, 99)}`
}

//noinspection SpellCheckingInspection
const token = new Buffer("Y2Y5NDdhZDJhYzJlMzg1OGNiNzQzYzcwOWZhNGI0OTk2NWQ4ZDg3Yg==", "base64").toString()
const iconPath = join(__dirname, "..", "fixtures", "test-app", "build", "icon.icns")

//test("GitHub unauthorized", async (t) => {
//  t.throws(await new GitHubPublisher("github-releases-test", "test-repo", versionNumber(), "incorrect token")
//    .releasePromise, /(Bad credentials|Unauthorized|API rate limit exceeded)/)
//})

function isApiRateError(e: Error): boolean {
  if (e instanceof HttpError) {
    return e.description != null && e instanceof HttpError && e.description.message != null && e.description.message.includes("API rate limit exceeded")
  }
  else {
    return false
  }
}

function testAndIgnoreApiRate(name: string, testFunction: () => Promise<any>) {
  test(name, async () => {
    try {
      await testFunction()
    }
    catch (e) {
      if (isApiRateError(e)) {
        console.warn(e.description.message)
      }
      else {
        throw e
      }
    }
  })
}

test("Bintray upload", async () => {
  const version = versionNumber()
  //noinspection SpellCheckingInspection
  const publisher = new BintrayPublisher({user: "actperepo", packageName: "test", repo: "generic"}, version, {bintrayToken: "5df2cadec86dff91392e4c419540785813c3db15"})
  try {
    const artifactName = `icon-${version}.icns`
    await publisher.upload(iconPath, artifactName)
    await publisher.upload(iconPath, artifactName)
  }
  finally {
    await publisher.deleteRelease()
  }
})

testAndIgnoreApiRate("GitHub upload", async () => {
  const publisher = new GitHubPublisher("actperepo", "ecb2", versionNumber(), {
    githubToken: token
  })
  try {
    await publisher.upload(iconPath)
    // test overwrite
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})

testAndIgnoreApiRate("prerelease", async () => {
  const publisher = new GitHubPublisher("actperepo", "ecb2", versionNumber(), {
    githubToken: token,
    draft: false,
    prerelease: true,
  })
  try {
    await publisher.upload(iconPath)
    const r = await publisher.getRelease()
    assertThat(r).hasProperties({
      prerelease: true,
      draft: false,
    })
  }
  finally {
    await publisher.deleteRelease()
  }
})

testAndIgnoreApiRate("incorrect tag name", async () => {
  const publisher = new GitHubPublisher("actperepo", "ecb2", "5.0", {
    githubToken: token,
    draft: false,
    prerelease: true,
    publish: "onTagOrDraft",
  })

  // await publisher.deleteOldReleases()
  try {
    await publisher.releasePromise
    //noinspection ExceptionCaughtLocallyJS
    throw new Error("No expected error")
  }
  catch (e) {
    if (e.message !== 'Tag name must starts with "v": 5.0') {
      throw e
    }
  }
  finally {
    await publisher.deleteRelease()
  }
})

testAndIgnoreApiRate("GitHub upload org", async () => {
  //noinspection SpellCheckingInspection
  const publisher = new GitHubPublisher("builder-gh-test", "darpa", versionNumber(), {
      githubToken: token
    })
  try {
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})

test("create publisher", async () => {
  const packager: any = {
    metadata: {
      version: "2.0.0",
    },
    devMetadata: {
      repository: "develar/test"
    },
  }
  const publisher = await createPublisher(packager, {
    githubToken: "__test__",
  }, "github")

  assertThat(publisher).hasProperties({
    "owner": "develar",
    "repo": "test",
    "token": "__test__",
    "version": "2.0.0",
  })
})