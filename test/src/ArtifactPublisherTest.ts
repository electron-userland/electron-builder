import { Arch, copyFile, TmpDir } from "builder-util"
import { CancellationToken, HttpError, S3Options, SpacesOptions } from "builder-util-runtime"
import { createPublisher } from "app-builder-lib/out/publish/PublishManager"
import { PublishContext } from "electron-publish"
import { BintrayPublisher } from "app-builder-lib/out/publish/BintrayPublisher"
import { GitHubPublisher } from "electron-publish/out/gitHubPublisher"
import { isCI as isCi } from "ci-info"
import * as path from "path"

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
const token = Buffer.from("Y2Y5NDdhZDJhYzJlMzg1OGNiNzQzYzcwOWZhNGI0OTk2NWQ4ZDg3Yg==", "base64").toString()
const iconPath = path.join(__dirname, "..", "fixtures", "test-app", "build", "icon.icns")

const publishContext: PublishContext = {
  cancellationToken: new CancellationToken(),
  progress: null,
}

test("GitHub unauthorized", async () => {
  try {
    await new GitHubPublisher(publishContext, {provider: "github", owner: "actperepo", repo: "ecb2", token: "incorrect token"}, versionNumber())._release.value
  }
  catch (e) {
    expect(e.message).toMatch(/(Bad credentials|Unauthorized|API rate limit exceeded)/)
    return
  }

  throw new Error("must be error")
})

function isApiRateError(e: Error): boolean {
  if (e.name === "HttpError") {
    const description = (e as HttpError).description
    return description.message != null && description.message.includes("API rate limit exceeded")
  }
  else {
    return false
  }
}

function testAndIgnoreApiRate(name: string, testFunction: () => Promise<any>) {
  test.skip(name, async () => {
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
  const version = "42.0.0"
  const tmpDir = new TmpDir("artifact-publisher-test")
  const artifactPath = await tmpDir.getTempFile({suffix: " test-space.icns"})
  await copyFile(iconPath, artifactPath)

  //noinspection SpellCheckingInspection
  const publisher = new BintrayPublisher(publishContext, {provider: "bintray", owner: "actperepo", package: "test", repo: "generic", token: "5df2cadec86dff91392e4c419540785813c3db15"}, version)
  try {
    // force delete old version to ensure that test doesn't depend on previous runs
    await publisher.deleteRelease(true)
    await publisher.upload({file: artifactPath, arch: Arch.x64})
    await publisher.upload({file: artifactPath, arch: Arch.x64})
  }
  finally {
    try {
      await publisher.deleteRelease(false)
    }
    finally {
      await tmpDir.cleanup()
    }
  }
})

testAndIgnoreApiRate("GitHub upload", async () => {
  const publisher = new GitHubPublisher(publishContext, {provider: "github", owner: "actperepo", repo: "ecb2", token}, versionNumber())
  try {
    await publisher.upload({file: iconPath, arch: Arch.x64})
    // test overwrite
    await publisher.upload({file: iconPath, arch: Arch.x64})
  }
  finally {
    await publisher.deleteRelease()
  }
})

if (process.env.AWS_ACCESS_KEY_ID != null && process.env.AWS_SECRET_ACCESS_KEY != null) {
  test("S3 upload", async () => {
    const publisher = createPublisher(publishContext, "0.0.1", {provider: "s3", bucket: "electron-builder-test"} as S3Options, {}, {} as any)!!
    await publisher.upload({file: iconPath, arch: Arch.x64})
    // test overwrite
    await publisher.upload({file: iconPath, arch: Arch.x64})
  })
}

if (process.env.DO_KEY_ID != null && process.env.DO_SECRET_KEY != null) {
  test("DO upload", async () => {
    const configuration: SpacesOptions = {
      provider: "spaces",
      name: "electron-builder-test",
      region: "nyc3",
    }
    const publisher = createPublisher(publishContext, "0.0.1", configuration, {}, {} as any)!!
    await publisher.upload({file: iconPath, arch: Arch.x64})
    // test overwrite
    await publisher.upload({file: iconPath, arch: Arch.x64})
  })
}

testAndIgnoreApiRate("prerelease", async () => {
  const publisher = new GitHubPublisher(publishContext, {provider: "github", owner: "actperepo", repo: "ecb2", token, releaseType: "prerelease"}, versionNumber())
  try {
    await publisher.upload({file: iconPath, arch: Arch.x64})
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
  const publisher = new GitHubPublisher(publishContext, {provider: "github", owner: "builder-gh-test", repo: "darpa", token}, versionNumber())
  try {
    await publisher.upload({file: iconPath, arch: Arch.x64})
  }
  finally {
    await publisher.deleteRelease()
  }
})