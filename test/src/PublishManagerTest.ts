import { getS3LikeProviderBaseUrl, R2Options } from "builder-util-runtime"
import { Arch, Platform } from "electron-builder"
import fsExtra from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { app } from "./helpers/packTester.js"

// This test reads app-update.yml out of the assembled .app (written by afterPack), so it stops before the zip target is
// built. The tests that need the built artifacts — latest-mac.yml / latest-linux.yml per provider, publish upload
// paths, artifact names, the deb for a custom provider — and the "reported once" repo-detection tests (they prove the
// report is deduplicated across the per-target/per-arch getResolvedPublishConfig calls, so the zip target must run)
// live in PublishManager.e2e.ts.

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
