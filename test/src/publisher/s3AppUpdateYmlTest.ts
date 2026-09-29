import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { Arch, Platform } from "app-builder-lib"
import { getAppUpdatePublishConfiguration, stripBuildTimeOnlyPublishOptions, writeAppUpdateYaml } from "app-builder-lib/src/publish/PublishManager"
import { load as yamlLoad } from "js-yaml"

// `awsCredentials` selects credential sources and local file paths on the build machine; it must never be shipped
// inside the app via app-update.yml (electron-updater reads s3 feeds anonymously and ignores it anyway).

const awsCredentials = { source: "profile", profile: "release", configFile: "/home/dev/.aws/config", credentialsFile: "/home/dev/.aws/credentials" } as const

function makePackager(publish: any): any {
  return {
    platform: Platform.LINUX,
    platformOptions: {},
    config: { publish },
    appInfo: { updaterCacheDirName: "test-app", channel: null, version: "1.0.0" },
    expandMacro: (value: string) => value,
    updateSigningKeys: { value: Promise.resolve([]) },
  }
}

test("getAppUpdatePublishConfiguration drops awsCredentials from the s3 config", async ({ expect }) => {
  const publishConfig = await getAppUpdatePublishConfiguration(makePackager({ provider: "s3", bucket: "my-bucket", region: "us-west-2", awsCredentials }), null, Arch.x64, false)
  expect(publishConfig).toMatchObject({ provider: "s3", bucket: "my-bucket", region: "us-west-2", updaterCacheDirName: "test-app" })
  expect(publishConfig).not.toHaveProperty("awsCredentials")
})

test("writeAppUpdateYaml never writes awsCredentials", async ({ expect }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-update-yml-"))
  try {
    await writeAppUpdateYaml(dir, { provider: "s3", bucket: "my-bucket", awsCredentials } as any)
    const content = fs.readFileSync(path.join(dir, "app-update.yml"), "utf8")
    expect(content).not.toMatch(/awsCredentials|release|\.aws/)
    expect(yamlLoad(content)).toEqual({ provider: "s3", bucket: "my-bucket" })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("stripBuildTimeOnlyPublishOptions does not mutate its input", ({ expect }) => {
  const config = { provider: "s3", bucket: "my-bucket", awsCredentials } as any
  expect(stripBuildTimeOnlyPublishOptions(config)).toEqual({ provider: "s3", bucket: "my-bucket" })
  expect(config.awsCredentials).toBe(awsCredentials)
})
