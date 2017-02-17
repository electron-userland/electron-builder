import { HttpError } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { S3Options } from "electron-builder-http/out/publishOptions"
import { TmpDir } from "electron-builder-util/out/tmp"
import { createPublisher } from "electron-builder/out/publish/PublishManager"
import { PublishContext } from "electron-publish"
import { BintrayPublisher } from "electron-publish/out/BintrayPublisher"
import { GitHubPublisher } from "electron-publish/out/gitHubPublisher"
import { copy } from "fs-extra-p"
import isCi from "is-ci"
import { join } from "path"

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

const publishContext: PublishContext = {
  cancellationToken: new CancellationToken(),
  progress: null,
}

test("Bintray upload", async () => {
  const version = versionNumber()

  const tmpDir = new TmpDir()
  const artifactPath = await tmpDir.getTempFile(`icon-${version}.icns`)
  await copy(iconPath, artifactPath)

  //noinspection SpellCheckingInspection
  const publisher = new BintrayPublisher(publishContext, {provider: "bintray", owner: "actperepo", package: "test", repo: "generic", token: "5df2cadec86dff91392e4c419540785813c3db15"}, version)
  try {
    await publisher.upload(artifactPath)
    await publisher.upload(artifactPath)
  }
  finally {
    try {
      await publisher.deleteRelease()
    }
    finally {
      await tmpDir.cleanup()
    }
  }
})

testAndIgnoreApiRate("GitHub upload", async () => {
  const publisher = new GitHubPublisher(publishContext, {provider: "github", owner: "actperepo", repo: "ecb2", token: token}, versionNumber())
  try {
    await publisher.upload(iconPath)
    // test overwrite
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})

if (process.env.AWS_ACCESS_KEY_ID != null && process.env.AWS_SECRET_ACCESS_KEY != null) {
  test("S3 upload", async () => {
    const publisher = createPublisher(publishContext, "0.0.1", <S3Options>{provider: "s3", bucket: "electron-builder-test"}, {})
    try {
      await publisher.upload(iconPath)
      // test overwrite
      await publisher.upload(iconPath)
    }
    finally {
      // await publisher.deleteRelease()
    }
  })
}

testAndIgnoreApiRate("prerelease", async () => {
  const publisher = new GitHubPublisher(publishContext, {provider: "github", owner: "actperepo", repo: "ecb2", token: token}, versionNumber(), {
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
  const publisher = new GitHubPublisher(publishContext, {provider: "github", owner: "builder-gh-test", repo: "darpa", token: token}, versionNumber())
  try {
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})