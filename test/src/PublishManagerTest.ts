import { GenericServerOptions, GithubOptions, KeygenOptions, R2Options, SpacesOptions } from "builder-util-runtime"
import { Arch, createTargets, Platform } from "electron-builder"
import fsExtra from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert.js"
import { app, checkDirContents } from "./helpers/packTester.js"

function spacesPublisher(publishAutoUpdate = true): SpacesOptions {
  return {
    provider: "spaces",
    name: "mySpaceName",
    region: "nyc3",
    publishAutoUpdate,
  }
}

function r2Publisher(publishAutoUpdate = true): R2Options {
  return {
    provider: "r2",
    bucket: "my-r2-bucket",
    accountId: "abcdef1234567890abcdef1234567890",
    publicUrl: "https://pub-abcdef1234567890abcdef1234567890.r2.dev",
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

test.ifNotWindows("generic, github and spaces", ({ expect }) =>
  app(expect, {
    targets: Platform.MAC.createTarget("zip", Arch.x64),
    config: {
      generateUpdatesFilesForAllChannels: true,
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [genericPublisher("https://example.com/downloads"), githubPublisher("foo/foo"), spacesPublisher()],
    },
  })
)

test.ifNotWindows("github and spaces (publishAutoUpdate)", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("AppImage", Arch.x64),
    config: {
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [githubPublisher("foo/foo"), spacesPublisher(false)],
    },
  })
)

test.ifNotWindows("generic, github and r2", ({ expect }) =>
  app(expect, {
    targets: Platform.MAC.createTarget("zip", Arch.x64),
    config: {
      generateUpdatesFilesForAllChannels: true,
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [genericPublisher("https://example.com/downloads"), githubPublisher("foo/foo"), r2Publisher()],
    },
  })
)

test.ifNotWindows("github and r2 (publishAutoUpdate)", ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("AppImage", Arch.x64),
    config: {
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [githubPublisher("foo/foo"), r2Publisher(false)],
    },
  })
)

test.ifEnv(process.env.KEYGEN_TOKEN)("mac artifactName ", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.LINUX.createTarget("zip", Arch.x64),
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

test.ifNotWindows("os macro", ({ expect }) =>
  app(
    expect,
    {
      targets: createTargets([Platform.LINUX, Platform.MAC], "zip", "x64"),
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
        return Promise.resolve()
      },
      packed: async context => {
        const dir = path.join(context.projectDir, "dist/s3")
        await assertThat(expect, dir).isDirectory()
        await checkDirContents(expect, dir)
      },
    }
  )
)

// disable on ifNotCi for now - slow on CircleCI
// error should be ignored because publish: never
// https://github.com/electron-userland/electron-builder/issues/2670
test("dotted s3 bucket", ({ expect }) =>
  app(
    expect,
    {
      targets: createTargets([Platform.LINUX], "zip", "x64"),
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
  ))

// https://github.com/electron-userland/electron-builder/issues/3261
test.ifNotWindows("custom provider", ({ expect }) =>
  app(
    expect,
    {
      targets: createTargets([Platform.LINUX], "deb", "x64"),
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
        fsExtra.outputFile(
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
