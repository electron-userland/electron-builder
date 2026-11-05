import { serializeToYaml } from "builder-util"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { Server } from "http"
import * as path from "path"
import { channelFileNotFoundError } from "electron-updater/src/providers/Provider"
import { afterEach, describe, test } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, makeLogger, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// a files[].url of latest*.yml can be a pre-signed URL: the updater's logs name it without its query, which holds the signature
describe("the update file URLs the updater logs", () => {
  const servers: Array<Server> = []
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close()
    }
  })

  test("have no query: Found version and Downloading update from", async ({ tmpDir, expect }) => {
    const root = await tmpDir.getTempDir({ prefix: "updater-log-url-server" })
    const { server, port } = await createLocalServer(root)
    servers.push(server)
    const installer = Buffer.from("updater log url test installer — not a real executable")
    const fileUrl = `http://127.0.0.1:${port}/app-1.1.0.exe?X-Amz-Signature=signature-secret`
    await fsExtra.outputFile(
      path.join(root, "latest.yml"),
      serializeToYaml({
        version: "1.1.0",
        files: [{ url: fileUrl, sha512: createHash("sha512").update(installer).digest("base64"), size: installer.length }],
        releaseDate: "2024-01-01T00:00:00.000Z",
      })
    )
    await fsExtra.outputFile(path.join(root, "app-1.1.0.exe"), installer)
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = await writeUpdateConfig({ provider: "generic", url: `http://127.0.0.1:${port}` })
    updater.autoDownload = false
    const logger = makeLogger()
    updater.logger = logger

    await updater.checkForUpdates()
    await updater.downloadUpdate()

    const named = logger.infos.filter(it => it.startsWith("Found version") || it.startsWith("Downloading update from"))
    expect(named).toEqual([`Found version 1.1.0 (url: http://127.0.0.1:${port}/app-1.1.0.exe)`, `Downloading update from http://127.0.0.1:${port}/app-1.1.0.exe`])
    expect(JSON.stringify(logger.infos)).not.toContain("signature-secret")
  })
})

// a provider's channel file URL copies the feed URL's query (e.g. a token): its errors name it without the query
test("a provider's channel file error names the URL without its query", ({ expect }) => {
  const error = channelFileNotFoundError("latest.yml", new URL("https://gitlab.example.com/api/v4/latest.yml?private_token=token-secret"), new Error("404"))
  expect(error.message).toContain("(https://gitlab.example.com/api/v4/latest.yml)")
  expect(error.message).not.toContain("token-secret")
})
