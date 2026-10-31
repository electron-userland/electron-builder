import { Arch, Platform } from "app-builder-lib"
import { getAppUpdatePublishConfiguration, writeAppUpdateYaml } from "app-builder-lib/src/publish/PublishManager"
import { serializeToYaml } from "builder-util"
import { DEFAULT_MAX_UPDATE_INFO_SIZE, GenericServerOptions } from "builder-util-runtime"
import { NsisUpdater } from "electron-updater"
import fsExtra from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { describe, test } from "vitest"
import { FakeElectronHttpExecutor, tuneTestUpdater } from "../helpers/updaterTestUtil.js"
import { TestAppAdapter } from "../helpers/TestAppAdapter.js"

// The update info responses (channel file, release feed, API response) are limited to 10 MiB by default. `maxUpdateInfoSize` in the
// publish configuration (written into app-update.yml) changes the limit of installed apps, and `autoUpdater.maxUpdateInfoSize` overrides it.

const FEED: GenericServerOptions = { provider: "generic", url: "https://feed.example.com/updates" }

// a valid latest.yml of exactly `size` bytes (padded with a YAML comment)
function channelFileOfSize(size: number): Buffer {
  const yml = serializeToYaml({ version: "1.1.0", files: [{ url: "TestApp-Setup-1.1.0.exe", sha512: "c2hhNTEy", size: 1 }], releaseDate: "2024-01-01T00:00:00.000Z" })
  const padding = size - Buffer.byteLength(yml) - 2
  return Buffer.from(`${yml}#${"a".repeat(padding)}\n`)
}

async function createUpdater(tmpDir: TmpDir, config: object | null, channelFileSize: number) {
  const updater = new NsisUpdater(null, new TestAppAdapter("1.0.0", await tmpDir.getTempDir({ prefix: "max-update-info-size-app" })))
  tuneTestUpdater(updater)
  updater.autoDownload = false
  const executor = new FakeElectronHttpExecutor(() => ({ statusCode: 200, body: channelFileOfSize(channelFileSize) }))
  ;(updater as any).httpExecutor = executor
  if (config != null) {
    const configPath = path.join(await tmpDir.getTempDir({ prefix: "max-update-info-size-config" }), "app-update.yml")
    await fsExtra.outputFile(configPath, serializeToYaml({ ...FEED, verifyUpdateCodeSignature: false, ...config }))
    updater.updateConfigPath = configPath
  }
  return { updater, executor }
}

describe("electron-updater maxUpdateInfoSize", () => {
  test("the default limit is 10 MiB, and the error names the options that raise it", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, {}, DEFAULT_MAX_UPDATE_INFO_SIZE + 1)
    const error = await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }).then(
      () => null,
      (e: unknown) => e
    )
    expect(error).toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
    expect(error).toBeInstanceOf(Error)
    const message = error instanceof Error ? error.message : ""
    expect(message).toContain(`${DEFAULT_MAX_UPDATE_INFO_SIZE} bytes`)
    expect(message).toContain("maxUpdateInfoSize in the publish configuration (app-update.yml)")
    expect(message).toContain("autoUpdater.maxUpdateInfoSize")

    const { updater: atLimit } = await createUpdater(tmpDir, {}, DEFAULT_MAX_UPDATE_INFO_SIZE)
    expect((await atLimit.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })

  test("maxUpdateInfoSize in app-update.yml raises the limit", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, { maxUpdateInfoSize: 2 * DEFAULT_MAX_UPDATE_INFO_SIZE }, DEFAULT_MAX_UPDATE_INFO_SIZE + 1)
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })

  test("maxUpdateInfoSize in app-update.yml lowers the limit", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, { maxUpdateInfoSize: 1024 }, 1025)
    await expect(updater.checkForUpdates({ crossOriginHeaders: defaults => defaults })).rejects.toMatchObject({
      code: "ERR_HTTP_RESPONSE_TOO_LARGE",
      message: expect.stringContaining("1024 bytes"),
    })
  })

  test("0 in app-update.yml disables the limit", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, { maxUpdateInfoSize: 0 }, DEFAULT_MAX_UPDATE_INFO_SIZE + 1)
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })

  test("autoUpdater.maxUpdateInfoSize takes precedence over app-update.yml", async ({ tmpDir, expect }) => {
    const { updater: raised } = await createUpdater(tmpDir, { maxUpdateInfoSize: 1024 }, 2048)
    raised.maxUpdateInfoSize = 4096
    expect((await raised.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")

    const { updater: lowered } = await createUpdater(tmpDir, { maxUpdateInfoSize: 4096 }, 2048)
    lowered.maxUpdateInfoSize = 1024
    await expect(lowered.checkForUpdates({ crossOriginHeaders: defaults => defaults })).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })

    // null goes back to the publish configuration
    lowered.maxUpdateInfoSize = null
    expect((await lowered.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })

  test("autoUpdater.maxUpdateInfoSize 0 disables the limit", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, {}, DEFAULT_MAX_UPDATE_INFO_SIZE + 1)
    updater.maxUpdateInfoSize = 0
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })

  test("maxUpdateInfoSize of the options given to setFeedURL applies", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, null, 2048)
    updater.setFeedURL({ ...FEED, maxUpdateInfoSize: 1024 })
    await expect(updater.checkForUpdates({ crossOriginHeaders: defaults => defaults })).rejects.toMatchObject({ code: "ERR_HTTP_RESPONSE_TOO_LARGE" })
  })

  test.for([-1, 1.5, NaN, Infinity, -Infinity, 2 ** 53, "1024", true])("autoUpdater.maxUpdateInfoSize = %s throws", async (value, { tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, {}, 1)
    expect(() => {
      updater.maxUpdateInfoSize = value as any
    }).toThrow(expect.objectContaining({ code: "ERR_UPDATER_INVALID_MAX_UPDATE_INFO_SIZE" }))
    expect(updater.maxUpdateInfoSize).toBeNull()
  })

  test("an invalid maxUpdateInfoSize in app-update.yml fails the check, unless autoUpdater.maxUpdateInfoSize is set", async ({ tmpDir, expect }) => {
    const { updater, executor } = await createUpdater(tmpDir, { maxUpdateInfoSize: -1 }, 2048)
    await expect(updater.checkForUpdates({ crossOriginHeaders: defaults => defaults })).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_MAX_UPDATE_INFO_SIZE" })
    expect(executor.sent).toHaveLength(0)

    updater.maxUpdateInfoSize = 4096
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })
})

// a custom updateProvider that is not built on electron-updater's Provider (e.g. one from another copy of electron-updater)
class ForeignProvider {
  constructor(..._args: Array<unknown>) {}

  get feedBaseUrl(): null {
    return null
  }

  setRequestHeaders(): void {
    // nothing to do
  }

  getLatestVersion() {
    return Promise.resolve({
      version: "1.1.0",
      files: [{ url: "TestApp-Setup-1.1.0.exe", sha512: "c2hhNTEy", size: 1 }],
      path: "",
      sha512: "",
      releaseDate: "2024-01-01T00:00:00.000Z",
    })
  }

  resolveFiles(): Array<never> {
    return []
  }
}

describe("electron-updater maxUpdateInfoSize with a custom provider without setMaxUpdateInfoSize", () => {
  test("the check succeeds with the default limit", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, null, 1)
    updater.setFeedURL({ provider: "custom", updateProvider: ForeignProvider })
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })

  test("the check succeeds with a limit set in the publish configuration or at runtime", async ({ tmpDir, expect }) => {
    const { updater } = await createUpdater(tmpDir, null, 1)
    updater.setFeedURL({ provider: "custom", updateProvider: ForeignProvider, maxUpdateInfoSize: 2048 })
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")

    updater.maxUpdateInfoSize = 4096
    expect((await updater.checkForUpdates({ crossOriginHeaders: defaults => defaults }))?.updateInfo.version).toBe("1.1.0")
  })
})

describe("electron-builder maxUpdateInfoSize", () => {
  function makePackager(publish: object): any {
    return {
      platform: Platform.LINUX,
      platformOptions: {},
      config: { publish },
      appInfo: { updaterCacheDirName: "test-app", channel: null, version: "1.0.0" },
      expandMacro: (value: string) => value,
      updateManifestOptions: false,
      updateSigningKeys: { value: Promise.resolve([]) },
      requireUpdateSigningKeys: async () => [],
    }
  }

  test.for([20 * 1024 * 1024, 0])("app-update.yml carries maxUpdateInfoSize %s", async (maxUpdateInfoSize, { tmpDir, expect }) => {
    const publishConfig = await getAppUpdatePublishConfiguration(makePackager({ ...FEED, maxUpdateInfoSize }), null, Arch.x64, false)
    expect(publishConfig).toMatchObject({ ...FEED, maxUpdateInfoSize })
    if (publishConfig == null) {
      throw new Error("no app-update.yml config")
    }
    const dir = await tmpDir.getTempDir({ prefix: "max-update-info-size-yml" })
    await writeAppUpdateYaml(dir, publishConfig)
    expect(load(await fsExtra.readFile(path.join(dir, "app-update.yml"), "utf8"))).toMatchObject({ maxUpdateInfoSize })
  })

  test.for([-1, 1.5, Infinity, "10MB"])("an invalid maxUpdateInfoSize %s is a configuration error", async (maxUpdateInfoSize, { expect }) => {
    await expect(getAppUpdatePublishConfiguration(makePackager({ ...FEED, maxUpdateInfoSize }), null, Arch.x64, false)).rejects.toThrow(
      /publish\.maxUpdateInfoSize must be a positive integer \(bytes\) or 0 for no limit/
    )
  })
})
