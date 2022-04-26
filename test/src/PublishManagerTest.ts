import { createTargets, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import { GithubOptions, GenericServerOptions, SpacesOptions, KeygenOptions } from "builder-util-runtime"
import { assertThat } from "./helpers/fileAssert"
import { app, checkDirContents } from "./helpers/packTester"

function spacesPublisher(publishAutoUpdate = true): SpacesOptions {
  return {
    provider: "spaces",
    name: "mySpaceName",
    region: "nyc3",
    publishAutoUpdate,
  }
}

function githubPublisher(repo: string): GithubOptions {
  return {
    provider: "github",
    repo,
  }
}

function genericPublisher(url: string): GenericServerOptions {
  return {
    provider: "generic",
    url,
  }
}

function keygenPublisher(): KeygenOptions {
  return {
    provider: "keygen",
    product: "43981278-96e7-47de-b8c2-98d59987206b",
    account: "cdecda36-3ef0-483e-ad88-97e7970f3149",
  }
}

test.ifNotWindows.ifDevOrLinuxCi(
  "generic, github and spaces",
  app({
    targets: Platform.MAC.createTarget("zip"),
    config: {
      generateUpdatesFilesForAllChannels: true,
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [genericPublisher("https://example.com/downloads"), githubPublisher("foo/foo"), spacesPublisher()],
    },
  })
)

test.ifNotWindows.ifDevOrLinuxCi(
  "github and spaces (publishAutoUpdate)",
  app({
    targets: Platform.LINUX.createTarget("AppImage"),
    config: {
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [githubPublisher("foo/foo"), spacesPublisher(false)],
    },
  })
)

test.ifMac(
  "mac artifactName ",
  app(
    {
      targets: Platform.MAC.createTarget("zip"),
      config: {
        // tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${productName}_${version}_${os}.${ext}",
        mac: {
          electronUpdaterCompatibility: ">=2.16",
        },
        publish: [spacesPublisher(), keygenPublisher()],
      },
    },
    {
      publish: undefined,
    }
  )
)

// otherwise test "os macro" always failed for pull requests
process.env.PUBLISH_FOR_PULL_REQUEST = "true"

test.ifAll.ifNotWindows(
  "os macro",
  app(
    {
      targets: createTargets([Platform.LINUX, Platform.MAC], "zip"),
      config: {
        publish: {
          provider: "s3",
          bucket: "my bucket",
          // tslint:disable-next-line:no-invalid-template-strings
          path: "${channel}/${os}",
        },
      },
    },
    {
      publish: "always",
      projectDirCreated: async projectDir => {
        process.env.__TEST_S3_PUBLISHER__ = path.join(projectDir, "dist/s3")
      },
      packed: async context => {
        const dir = path.join(context.projectDir, "dist/s3")
        await assertThat(dir).isDirectory()
        await checkDirContents(dir)
      },
    }
  )
)

// disable on ifNotCi for now - slow on CircleCI
// error should be ignored because publish: never
// https://github.com/electron-userland/electron-builder/issues/2670
test.ifAll.ifNotCi(
  "dotted s3 bucket",
  app(
    {
      targets: createTargets([Platform.LINUX], "zip"),
      config: {
        publish: {
          provider: "s3",
          bucket: "bucket.dotted.name",
        },
      },
    },
    {
      publish: "never",
    }
  )
)

// https://github.com/electron-userland/electron-builder/issues/3261
test.ifAll.ifNotWindows(
  "custom provider",
  app(
    {
      targets: createTargets([Platform.LINUX], "zip"),
      config: {
        publish: {
          provider: "custom",
          boo: "foo",
        },
      },
    },
    {
      publish: "never",
      projectDirCreated: projectDir =>
        outputFile(
          path.join(projectDir, "build/electron-publisher-custom.js"),
          `class Publisher {
    async upload(task) {
    }
  }
  
  module.exports = Publisher`
        ),
    }
  )
)
