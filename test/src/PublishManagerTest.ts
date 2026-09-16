import { log } from "builder-util"
import { getS3LikeProviderBaseUrl, R2Options } from "builder-util-runtime"
import { Arch, Platform } from "electron-builder"
import fsExtra from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { vi } from "vitest"
import { app } from "./helpers/packTester.js"

// These tests read app-update.yml out of the assembled .app (written by afterPack), so they stop before the zip target is
// built. The tests that need the built artifacts — latest-mac.yml / latest-linux.yml per provider, publish upload
// paths, artifact names, the deb for a custom provider — live in PublishManager.e2e.ts.

function r2Publisher(publishAutoUpdate = true): R2Options {
  return {
    provider: "r2",
    bucket: "my-r2-bucket",
    accountId: "abcdef1234567890abcdef1234567890",
    publicUrl: "https://pub-abcdef1234567890abcdef1234567890.r2.dev",
    publishAutoUpdate,
  }
}

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
      // app-update.yml is written into the .app by afterPack — the zip target only has to be configured, not built
      afterPackTestHook: async () => true,
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
        afterPackTestHook: async () => true,
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
        afterPackTestHook: async () => true,
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
