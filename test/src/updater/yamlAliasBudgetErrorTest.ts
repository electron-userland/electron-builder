import { serializeToYaml } from "builder-util"
import { AppUpdateConfiguration, GenericServerOptions } from "builder-util-runtime"
import type { AppUpdater } from "electron-updater"
import fsExtra from "fs-extra"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { vi } from "vitest"
import { mockAliasChainYaml, mockComplexKeyYaml, mockYaml } from "../helpers/providerTestUtil.js"
import { createMockRequest, createNsisUpdater } from "../helpers/updaterTestUtil.js"

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-manifest-yaml-aliases-are-limited"
const FEED_TOKEN = "s3cr3t-feed-token"

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

async function createGenericUpdater(tmpDir: TmpDir, requestSpy: ReturnType<typeof createMockRequest>, logger: AppUpdater["logger"]) {
  const updater = await createNsisUpdater("0.0.1")
  ;(updater as any).httpExecutor = { request: requestSpy }
  updater.autoDownload = false
  updater.logger = logger
  const options: AppUpdateConfiguration<GenericServerOptions> = {
    provider: "generic",
    url: `https://updates.example.com/feed?token=${FEED_TOKEN}`,
    verifyUpdateCodeSignature: false,
  }
  const configPath = path.join(await tmpDir.getTempDir({ prefix: "update-config" }), "app-update.yml")
  await fsExtra.outputFile(configPath, serializeToYaml(options))
  updater.updateConfigPath = configPath
  return updater
}

test("a manifest whose YAML aliases expand past the budget is rejected with the migration link on every check", async ({ tmpDir, expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, createLogger())

  requestSpy.mockResolvedValue(mockAliasChainYaml("1.0.1", 40))

  for (let i = 0; i < 3; i++) {
    await expect(updater.checkForUpdates()).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_UPDATE_INFO",
      message: expect.stringMatching(new RegExp(String.raw`electron-updater 7 \(electron-builder v27\) rejects such a manifest: .* ${DOCS}$`)),
    })
  }
})

test("a manifest that is not valid YAML is not reported as the v27 alias limit", async ({ tmpDir, expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, createLogger())

  requestSpy.mockResolvedValueOnce(`${mockYaml("1.0.1")}releaseNotes: [unclosed\n`)

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.not.stringContaining(DOCS) })
})

test("a manifest rejected while loading for aliases in a complex mapping key is reported as the v27 alias limit", async ({ tmpDir, expect }) => {
  const requestSpy = createMockRequest()
  const updater = await createGenericUpdater(tmpDir, requestSpy, createLogger())

  requestSpy.mockResolvedValueOnce(mockComplexKeyYaml("1.0.1"))

  await expect(updater.checkForUpdates()).rejects.toMatchObject({ code: "ERR_UPDATER_INVALID_UPDATE_INFO", message: expect.stringContaining(DOCS) })
})

// the feed URL's query is copied onto the channel file URL, and the updater logs the error with its stack
test.for([
  ["a manifest whose YAML aliases expand past the budget", mockAliasChainYaml("1.0.1", 40)],
  ["a manifest that is not valid YAML", `${mockYaml("1.0.1")}releaseNotes: [unclosed\n`],
  ["a manifest rejected while loading for aliases in a complex mapping key", mockComplexKeyYaml("1.0.1")],
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
