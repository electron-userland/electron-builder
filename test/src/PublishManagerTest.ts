import { createTargets, Platform } from "electron-builder"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, checkDirContents } from "./helpers/packTester"

test.ifDevOrLinuxCi("generic, github and spaces", app({
  targets: Platform.MAC.createTarget("zip"),
  config: {
    generateUpdatesFilesForAllChannels: true,
    mac: {
      electronUpdaterCompatibility: ">=2.16",
    },
    publish: [
      {
        provider: "generic",
        url: "https://example.com/downloads"
      },
      {
        provider: "github",
        repo: "foo/foo"
      },
      {
        provider: "spaces",
        name: "mySpaceName",
        region: "nyc3"
      },
    ]
  },
}))

test.ifDevOrLinuxCi("github and spaces (publishAutoUpdate)", app({
  targets: Platform.LINUX.createTarget("AppImage"),
  config: {
    mac: {
      electronUpdaterCompatibility: ">=2.16",
    },
    publish: [
      {
        provider: "github",
        repo: "foo/foo"
      },
      {
        provider: "spaces",
        name: "mySpaceName",
        region: "nyc3",
        publishAutoUpdate: false
      },
    ]
  },
}))

test.ifAll("mac artifactName ", app({
  targets: Platform.MAC.createTarget("zip"),
  config: {
    // tslint:disable-next-line:no-invalid-template-strings
    artifactName: "${productName}_${version}_${os}.${ext}",
    mac: {
      electronUpdaterCompatibility: ">=2.16",
    },
    publish: [
      {
        provider: "spaces",
        name: "mySpaceName",
        region: "nyc3"
      },
    ]
  },
}, {
  publish: undefined,
}))

// otherwise test "os macro" always failed for pull requests
process.env.PUBLISH_FOR_PULL_REQUEST = "true"

test.ifAll.ifNotWindows("os macro", app({
  targets: createTargets([Platform.LINUX, Platform.MAC], "zip"),
  config: {
    publish: {
      provider: "s3",
      bucket: "my bucket",
      // tslint:disable-next-line:no-invalid-template-strings
      path: "${channel}/${os}"
    },
  },
}, {
  publish: "always",
  projectDirCreated: async projectDir => {
    process.env.__TEST_S3_PUBLISHER__ = path.join(projectDir, "dist/s3")
  },
  packed: async context => {
    const dir = path.join(context.projectDir, "dist/s3")
    await assertThat(dir).isDirectory()
    await checkDirContents(dir)
  }
}))

// https://github.com/electron-userland/electron-builder/issues/2670
test.ifAll.ifNotWindows("dotted s3 bucket", app({
  targets: createTargets([Platform.LINUX], "zip"),
  config: {
    publish: {
      provider: "s3",
      bucket: "bucket.dotted.name",
    },
  },
}, {
  publish: "never"
}))