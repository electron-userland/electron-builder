import { Metadata } from "app-builder-lib"
// checkMetadata is marked @internal, so it is stripped from the published .d.ts —
// import the implementation directly like electronGetTest does for parseExpectedChecksum.
import * as packageMetadataInternal from "app-builder-lib/src/util/packageMetadata"
import { describe, expect, test } from "vitest"

const { checkMetadata } = packageMetadataInternal as any

function checkUpdaterDependency(updaterVersion: string) {
  const metadata: Metadata = {
    name: "test-app",
    version: "1.0.0",
    description: "test",
    author: { name: "test" },
    dependencies: { "electron-updater": updaterVersion },
  }
  checkMetadata(metadata, metadata, "package.json", "package.json")
}

describe("checkMetadata electron-updater version", () => {
  test.each(["6.8.12", "^6.3.9", "~6.0.0", ">=6", "^4.0.0", "patch:electron-updater@npm%3A6.6.2#~/.yarn/patches/electron-updater-npm-6.6.2-abc.patch"])(
    "accepts electron-updater %s",
    updaterVersion => {
      expect(() => checkUpdaterDependency(updaterVersion)).not.toThrow()
    }
  )

  test("rejects too-old electron-updater", () => {
    expect(() => checkUpdaterDependency("^3.0.0")).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
  })

  // electron-updater 7 rejects the app-update.yml electron-builder 26 writes, so installs of such a build could never update
  test.each([
    "7.0.0-alpha.13",
    "^7.0.0-alpha.5",
    "7.0.0",
    "^7.1.0",
    "7.x",
    ">=7.0.0-alpha.13",
    "patch:electron-updater@npm%3A7.0.0-alpha.13#~/.yarn/patches/electron-updater-npm-7.0.0-alpha.13-abc.patch",
  ])("rejects electron-updater %s", updaterVersion => {
    expect(() => checkUpdaterDependency(updaterVersion)).toThrow(
      /requires an app built with electron-builder 27: electron-updater 7 rejects the update configuration that electron-builder 26 writes/
    )
  })

  test("the electron-updater 7 error links the migration guide and names both fixes", () => {
    expect(() => checkUpdaterDependency("7.0.0-alpha.13")).toThrow(
      /Build with electron-builder 27, or keep electron-updater 6 \(e\.g\. "\^6\.8\.12"\)\. See https:\/\/www\.electron\.build\/docs\/migration\/v26-to-v27/
    )
  })
})
