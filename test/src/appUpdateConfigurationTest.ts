import { AppUpdateConfiguration, GenericServerOptions } from "builder-util-runtime"
import { describe, expect, test } from "vitest"

// Type-level: `pnpm typecheck:test` fails when one of these fields is a publish option again (the @ts-expect-error is then unused).
describe("AppUpdateConfiguration", () => {
  test("the fields electron-builder writes into app-update.yml are not publish options", () => {
    const url = "https://example.com/updates"
    // @ts-expect-error setFeedURL and the updater constructors never read it
    const publisherName: GenericServerOptions = { provider: "generic", url, publisherName: ["CN=Acme"] }
    // @ts-expect-error setFeedURL and the updater constructors never read it
    const verifyUpdateCodeSignature: GenericServerOptions = { provider: "generic", url, verifyUpdateCodeSignature: false }
    // @ts-expect-error setFeedURL and the updater constructors never read it
    const updaterCacheDirName: GenericServerOptions = { provider: "generic", url, updaterCacheDirName: "app-updater" }
    // @ts-expect-error setFeedURL and the updater constructors never read it; the runtime setting is autoUpdater.updateManifestPublicKey
    const updateManifestPublicKey: GenericServerOptions = { provider: "generic", url, updateManifestPublicKey: "key" }

    const appUpdate: AppUpdateConfiguration<GenericServerOptions> = {
      provider: "generic",
      url,
      publisherName: ["CN=Acme"],
      verifyUpdateCodeSignature: false,
      updaterCacheDirName: "app-updater",
      updateManifestPublicKey: "key",
    }
    for (const config of [publisherName, verifyUpdateCodeSignature, updaterCacheDirName, updateManifestPublicKey]) {
      expect(config.url).toBe(appUpdate.url)
    }
  })
})
