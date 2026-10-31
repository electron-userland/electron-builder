import { serializeToYaml } from "builder-util"
import { GenericServerOptions } from "builder-util-runtime"
import type { AppUpdater } from "electron-updater"
import fsExtra from "fs-extra"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { vi } from "vitest"
import { mockAliasChainYaml, mockYaml } from "../helpers/providerTestUtil.js"
import { createMockRequest, createNsisUpdater } from "../helpers/updaterTestUtil.js"

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-manifest-yaml-aliases-are-limited"
const ANNOUNCEMENT =
  "electron-updater 7 (electron-builder v27) rejects an update manifest (latest*.yml) whose YAML aliases (&name / *name) expand past its size limit: " +
  "this one was rejected with ERR_UPDATER_INVALID_UPDATE_INFO, so this app does not update until the manifest is replaced. " +
  "Publish latest*.yml without YAML aliases (js-yaml `dump` with `noRefs: true`, as electron-builder writes it) or with the shared values repeated inline. " +
  DOCS
const FEED_TOKEN = "s3cr3t-feed-token"

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

async function createGenericUpdater(tmpDir: TmpDir, requestSpy: ReturnType<typeof createMockRequest>, logger: AppUpdater["logger"]) {
  const updater = await createNsisUpdater("0.0.1")
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.logger = logger
  const options: GenericServerOptions = { provider: "generic", url: `https://updates.example.com/feed?token=${FEED_TOKEN}`, verifyUpdateCodeSignature: false }
  const configPath = path.join(await tmpDir.getTempDir({ prefix: "update-config" }), "app-update.yml")
  await fsExtra.outputFile(configPath, serializeToYaml(options))
  updater.updateConfigPath = configPath
  return updater
}

function announcements(logger: ReturnType<typeof createLogger>): Array<string> {
  return logger.warn.mock.calls.map(call => String(call[0])).filter(message => message.startsWith("electron-updater 7 (electron-builder v27) rejects an update manifest"))
}

test("a manifest whose YAML aliases expand past the budget is rejected with the migration link, and announced once per updater", async ({ tmpDir, expect }) => {
  const logger = createLogger()
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, logger)

  requestSpy.mockResolvedValue(mockAliasChainYaml("1.0.1", 40))

  for (let i = 0; i < 3; i++) {
    await expect(updater.checkForUpdates()).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_UPDATE_INFO",
      message: expect.stringContaining(`electron-updater 7 (electron-builder v27) rejects such a manifest`),
    })
  }
  await expect(updater.checkForUpdates()).rejects.toThrow(DOCS)

  expect(announcements(logger)).toEqual([ANNOUNCEMENT])
  // the feed URL may carry credentials in its query: the announcement never names it
  expect(announcements(logger).join("\n")).not.toContain(FEED_TOKEN)

  // counted per updater instance
  const otherLogger = createLogger()
  const otherUpdater = await createGenericUpdater(tmpDir, requestSpy, otherLogger)
  await expect(otherUpdater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO" })
  expect(announcements(otherLogger)).toEqual([ANNOUNCEMENT])
})

test("a manifest that is not valid YAML is not announced as the v27 alias limit", async ({ tmpDir, expect }) => {
  const logger = createLogger()
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, logger)

  requestSpy.mockResolvedValueOnce(`${mockYaml("1.0.1")}releaseNotes: [unclosed\n`)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.not.stringContaining(DOCS) })
  expect(announcements(logger)).toEqual([])
})

test("a logger that throws does not replace the alias-budget error", async ({ tmpDir, expect }) => {
  const throwing = () => {
    throw new Error("logger failure")
  }
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, { info: throwing, warn: throwing, error: throwing })

  requestSpy.mockResolvedValueOnce(mockAliasChainYaml("1.0.1", 40))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringContaining(DOCS) })
})

// the feed URL's query is copied onto the channel file URL, and the updater logs the error with its stack
test.for([
  ["a manifest whose YAML aliases expand past the budget", mockAliasChainYaml("1.0.1", 40)],
  ["a manifest that is not valid YAML", `${mockYaml("1.0.1")}releaseNotes: [unclosed\n`],
])("the update info error for %s names the channel file without the feed URL's query", async ([_name, manifest], { tmpDir, expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, createLogger())

  requestSpy.mockResolvedValueOnce(manifest)

  const error: unknown = await updater.checkForUpdates().then(
    () => null,
    (e: unknown) => e
  )
  expect(error).toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringContaining("(https://updates.example.com/feed/latest.yml)") })
  expect(error instanceof Error ? `${error.message}\n${error.stack}` : String(error)).not.toContain(FEED_TOKEN)
})
