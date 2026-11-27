import { type GenericServerOptions, type UpdateFileInfo, type UpdateInfo } from "builder-util-runtime"
import { GenericProvider } from "electron-updater/src/providers/GenericProvider"
import { GitLabProvider } from "electron-updater/src/providers/GitLabProvider"
import { PrivateGitHubProvider } from "electron-updater/src/providers/PrivateGitHubProvider"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// A downloaded update is hashed again against the checksum of its update info right before it is installed, so an update file without a
// checksum could be downloaded but never installed. The GitLab and private GitHub providers and custom providers resolve files without the
// check in Provider.resolveFiles, so executeDownload rejects such update info for every provider before the download starts.

const INSTALLER = Buffer.from("no-checksum test installer, not a real executable")
const INSTALLER_NAME = "TestApp-Setup-1.1.0.exe"
const INSTALLER_SHA512 = createHash("sha512").update(INSTALLER).digest("base64")
const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#downloaded-updates-are-checked-again-before-they-are-installed"

type ProviderKind = "gitlab" | "private-github" | "custom"

describe("an update file without a checksum", () => {
  const servers: Array<Server> = []
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close()
    }
  })

  // the installer on a local server, and an updater whose provider of `kind` resolves it from release assets (or, for a custom provider,
  // without Provider.resolveFiles)
  async function setup(tmpDir: TmpDir, kind: ProviderKind, file: Partial<UpdateFileInfo>) {
    const root = await tmpDir.getTempDir({ prefix: "no-checksum-server" })
    await fsExtra.outputFile(path.join(root, INSTALLER_NAME), INSTALLER)
    const requests: Array<string> = []
    const { server, port } = await createLocalServer(root, "127.0.0.1", url => requests.push(url))
    servers.push(server)
    const feed = `http://127.0.0.1:${port}`
    const assetUrl = `${feed}/${INSTALLER_NAME}`

    const updater = await createNsisUpdater("1.0.0")
    // no publisherName: the installer is not Authenticode-signed (see writeUpdateConfig)
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: feed })
    const errors: Array<Error> = []
    updater.on("error", error => errors.push(error))

    const runtimeOptions = (updater as any).createProviderRuntimeOptions()
    const files = [{ url: INSTALLER_NAME, size: INSTALLER.length, ...file } as UpdateFileInfo]
    const info: UpdateInfo = { version: "1.1.0", files, path: INSTALLER_NAME, sha512: file.sha512 ?? "", releaseDate: "2024-01-01T00:00:00.000Z" }
    let updateInfo: UpdateInfo = info
    let provider
    if (kind === "gitlab") {
      provider = new GitLabProvider({ provider: "gitlab", projectId: 1 }, updater, runtimeOptions)
      updateInfo = { ...info, tag: "v1.1.0", assets: new Map([[INSTALLER_NAME, assetUrl]]) } as UpdateInfo
    } else if (kind === "private-github") {
      provider = new PrivateGitHubProvider({ provider: "github", owner: "owner", repo: "repo" }, updater, "token", runtimeOptions)
      updateInfo = { ...info, assets: [{ name: INSTALLER_NAME, url: assetUrl }] } as UpdateInfo
    } else {
      // a custom updateProvider that resolves the files itself
      class OwnFilesProvider extends GenericProvider {
        resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
          return updateInfo.files.map(it => ({ url: new URL(it.url, `${feed}/`), info: it }))
        }
      }
      provider = new OwnFilesProvider({ provider: "generic", url: feed }, updater, runtimeOptions)
    }
    ;(updater as any).updateInfoAndProvider = { info: updateInfo, provider }
    return { updater, errors, requests }
  }

  const installerRequests = (requests: Array<string>) => requests.filter(it => it.includes(INSTALLER_NAME))

  for (const kind of ["gitlab", "private-github", "custom"] as const) {
    test(`is not downloaded with a ${kind} provider`, async ({ expect, tmpDir }) => {
      const { updater, errors, requests } = await setup(tmpDir, kind, {})

      await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_CHECKSUM" })

      expect(installerRequests(requests)).toEqual([])
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain(`Update info doesn't contain a sha512 or sha2 checksum for ${INSTALLER_NAME}`)
      expect(errors[0].message.endsWith(DOCS)).toBe(true)
    })
  }

  // empty values are no checksum either, as for the check right before the install
  test("is not downloaded when its checksums are empty", async ({ expect, tmpDir }) => {
    const { updater, requests } = await setup(tmpDir, "gitlab", { sha512: "", sha2: "" } as Partial<UpdateFileInfo>)
    await expect(updater.downloadUpdate()).rejects.toMatchObject({ code: "ERR_UPDATER_NO_CHECKSUM" })
    expect(installerRequests(requests)).toEqual([])
  })

  for (const kind of ["gitlab", "private-github", "custom"] as const) {
    test(`with a sha512, is downloaded with a ${kind} provider`, async ({ expect, tmpDir }) => {
      const { updater, errors, requests } = await setup(tmpDir, kind, { sha512: INSTALLER_SHA512 })

      const downloaded = await updater.downloadUpdate()

      expect(installerRequests(requests)).toHaveLength(1)
      expect(errors).toEqual([])
      expect(await fsExtra.readFile(downloaded.updateFile)).toEqual(INSTALLER)
    })
  }
})
