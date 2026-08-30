import { log } from "builder-util"
import { GenericServerOptions, getS3LikeProviderBaseUrl, GithubOptions, KeygenOptions, R2Options, SpacesOptions } from "builder-util-runtime"
import { Arch, createTargets, Platform } from "electron-builder"
import fsExtra from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { vi } from "vitest"
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

// app-update.yml is generated from the FIRST publisher; electron-updater reads it on end-user
// machines and derives the download URL from it, so it must carry provider: r2, the publicUrl
// and the channel exactly as configured.
test.ifNotWindows("r2 as first publisher writes provider r2 to app-update.yml", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("zip", Arch.x64),
      config: {
        mac: {
          electronUpdaterCompatibility: ">=2.16",
        },
        publish: [{ ...r2Publisher(), channel: "beta" }],
      },
    },
    {
      packed: async context => {
        const updateConfig = load(await fsExtra.readFile(path.join(context.getResources(Platform.MAC, Arch.x64), "app-update.yml"), "utf-8")) as any
        expect(updateConfig.provider).toBe("r2")
        expect(updateConfig.publicUrl).toBe("https://pub-abcdef1234567890abcdef1234567890.r2.dev")
        expect(updateConfig.channel).toBe("beta")
        // electron-updater derives the download base URL from app-update.yml via getS3LikeProviderBaseUrl
        expect(getS3LikeProviderBaseUrl(updateConfig)).toBe("https://pub-abcdef1234567890abcdef1234567890.r2.dev")
      },
    }
  )
)

// A github publish config without owner/repo is completed from the repository info (package.json "repository",
// CI env vars, then .git/config). The result is written into app-update.yml inside the shipped app and becomes its
// permanent update feed, so the build has to report which repository it resolved to - and report it exactly once,
// even though getResolvedPublishConfig runs per target and arch.
test.ifNotWindows("detected github repo is reported once and written to app-update.yml", async ({ expect }) => {
  const oldSlug = process.env.TRAVIS_REPO_SLUG
  const warn = vi.spyOn(log, "warn")
  try {
    process.env.TRAVIS_REPO_SLUG = "detected-owner/detected-repo"
    await app(
      expect,
      {
        targets: Platform.MAC.createTarget("zip", Arch.x64),
        config: {
          publish: { provider: "github" },
        },
      },
      {
        publish: "never",
        packed: async context => {
          const updateConfig = load(await fsExtra.readFile(path.join(context.getResources(Platform.MAC, Arch.x64), "app-update.yml"), "utf-8")) as any
          expect(updateConfig.owner).toBe("detected-owner")
          expect(updateConfig.repo).toBe("detected-repo")

          const reported = warn.mock.calls.filter(([messageOrFields]) => typeof messageOrFields === "object" && messageOrFields != null && "owner" in messageOrFields)
          expect(reported).toHaveLength(1)
          expect(reported[0][0]).toMatchObject({
            reason: "owner and repo not specified in the publish configuration",
            source: "TRAVIS_REPO_SLUG",
            provider: "github",
            owner: "detected-owner",
            repo: "detected-repo",
          })
        },
      }
    )
  } finally {
    warn.mockRestore()
    if (oldSlug == null) {
      delete process.env.TRAVIS_REPO_SLUG
    } else {
      process.env.TRAVIS_REPO_SLUG = oldSlug
    }
  }
})

// A repository taken from package.json "repository" is deliberate configuration, so it is reported at info level
// instead of warn - and still exactly once per build.
test.ifNotWindows("repo detected from package.json is reported once at info level", async ({ expect }) => {
  const info = vi.spyOn(log, "info")
  const warn = vi.spyOn(log, "warn")
  const isFeedReport = ([messageOrFields]: ReadonlyArray<unknown>) =>
    typeof messageOrFields === "object" && messageOrFields != null && "source" in messageOrFields && "owner" in messageOrFields
  try {
    await app(
      expect,
      {
        targets: Platform.MAC.createTarget("zip", Arch.x64),
        config: {
          extraMetadata: {
            repository: "detected-owner/detected-repo",
          } as any,
          publish: { provider: "github" },
        },
      },
      {
        publish: "never",
        packed: async context => {
          const updateConfig = load(await fsExtra.readFile(path.join(context.getResources(Platform.MAC, Arch.x64), "app-update.yml"), "utf-8")) as any
          expect(updateConfig.owner).toBe("detected-owner")
          expect(updateConfig.repo).toBe("detected-repo")

          expect(warn.mock.calls.filter(isFeedReport)).toHaveLength(0)

          const reported = info.mock.calls.filter(isFeedReport)
          expect(reported).toHaveLength(1)
          expect(reported[0][0]).toMatchObject({
            reason: "owner and repo not specified in the publish configuration",
            source: "package.json",
            provider: "github",
            owner: "detected-owner",
            repo: "detected-repo",
          })
        },
      }
    )
  } finally {
    info.mockRestore()
    warn.mockRestore()
  }
})

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

// nothing is uploaded here (publish: undefined) — KeygenPublisher merely requires KEYGEN_TOKEN to be
// present at construction time, so a dummy value keeps this packaging test fully offline.
// ifNotWindows like the sibling tests: the previous KEYGEN_TOKEN gate meant this never ran on
// Windows shards, and building the Linux zip target there is untested territory.
test.ifNotWindows("mac artifactName ", async ({ expect }) => {
  vi.stubEnv("KEYGEN_TOKEN", "dummy-keygen-token-for-offline-test")
  try {
    await app(
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
  } finally {
    vi.unstubAllEnvs()
  }
})

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
