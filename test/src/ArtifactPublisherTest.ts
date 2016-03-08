import test from "ava-tf"
import { GitHubPublisher } from "out/gitHubPublisher"
import { HttpError } from "out/gitHubRequest"
import { join } from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function versionNumber() {
  return getRandomInt(0, 99) + "." + Date.now() + "." + getRandomInt(0, 9)
}

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

testAndIgnoreApiRate("GitHub upload", async () => {
  const publisher = new GitHubPublisher("actperepo", "ecb2", versionNumber(), token)
  try {
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})

testAndIgnoreApiRate("GitHub overwrite on upload", async () => {
  const publisher = new GitHubPublisher("actperepo", "ecb2", versionNumber(), token)
  try {
    await publisher.upload(iconPath)
    await publisher.upload(iconPath)
  }
  finally {
    await publisher.deleteRelease()
  }
})
