import { GitHubPublisher } from "electron-builder/out/publish/gitHubPublisher"
import { join } from "path"
import { BintrayPublisher } from "electron-builder/out/publish/BintrayPublisher"
import { createPublisher } from "electron-builder/out/publish/PublishManager"
import isCi from "is-ci"
import { HttpError } from "electron-builder-http"
import BluebirdPromise from "bluebird-lst-c"
import { SourceRepositoryInfo } from "electron-builder"
import { GithubOptions } from "electron-builder-http/out/publishOptions"

if (isCi && process.platform === "win32") {
  fit("Skip ArtifactPublisherTest suite on Windows CI", () => {
    console.warn("[SKIP] Skip ArtifactPublisherTest suite on Windows CI")
  })
}

if (process.env.ELECTRON_BUILDER_OFFLINE === "true") {
  fit("Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined", () => {
    console.warn("[SKIP] Skip ArtifactPublisherTest suite — ELECTRON_BUILDER_OFFLINE is defined")
  })
}

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
  if (e.name === "HttpError") {
    const description = (<HttpError>e).description
    return description.message != null && description.message.includes("API rate limit exceeded")
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
  const publisher = new BintrayPublisher({provider: "bintray", owner: "actperepo", package: "test", repo: "generic", token: "5df2cadec86dff91392e4c419540785813c3db15"}, version)
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
  const publisher = new GitHubPublisher({provider: "github", owner: "actperepo", repo: "ecb2", token: token}, versionNumber())
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
  const publisher = new GitHubPublisher({provider: "github", owner: "actperepo", repo: "ecb2", token: token}, versionNumber(), {
    draft: false,
    prerelease: true,
  })
  try {
    await publisher.upload(iconPath)
    const r = await publisher.getRelease()
    expect(r).toMatchObject({
      prerelease: true,
      draft: false,
    })
  }
  finally {
    await publisher.deleteRelease()
  }
})

testAndIgnoreApiRate("GitHub upload org", async () => {
  //noinspection SpellCheckingInspection
  const publisher = new GitHubPublisher({provider: "github", owner: "builder-gh-test", repo: "darpa", token: token}, versionNumber())
  try {
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})

it("create publisher", async () => {
  const packager: any = {
    metadata: {
      version: "2.0.0",
      repository: "develar/test"
    },
    repositoryInfo: BluebirdPromise.resolve(<SourceRepositoryInfo>{type: "github", domain: "github.com", user: "develar", project: "test",})
  }
  const publisher = await createPublisher(packager, <GithubOptions>{provider: "github", vPrefixedTagName: false, token: "__test__"}, {})
  expect(publisher).toMatchObject({
    info: {
      provider: "github",
      vPrefixedTagName: false,
      owner: "develar",
      repo: "test",
      token: "__test__",
    },
    token: "__test__",
    "version": "2.0.0",
    "tag": "2.0.0",
  })
})