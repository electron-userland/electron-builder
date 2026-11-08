import { Packager } from "app-builder-lib"
import { warnAboutUpdateFilesBeforeUpload } from "app-builder-lib/internal"
import { createUpdateManifestSignatures, generateUpdateSigningKeypair, log, parsePrivateKey, serializeToYaml } from "builder-util"
import { hashFile } from "builder-util-runtime"
import { createUploadTasks, publishPackageWithTasks } from "electron-builder/src/publish"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

vi.mock("builder-util-runtime", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util-runtime")>()
  return { ...actual, hashFile: vi.fn(actual.hashFile) }
})

// `electron-builder publish -f` warns about update info and the files it lists before it uploads them

const ANNOUNCEMENT = "uploading update info (latest*.yml or a channel's .yml) or the files it lists"
const MISMATCH = "the uploaded file does not match its update info"
const key = generateUpdateSigningKeypair()

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  log.resetLimits("update-files-upload")
  warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function write(file: string, content: string | Buffer): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

/** Update info signed as updateInfoBuilder writes it. */
function updateInfo(info: any): string {
  const signatures = createUpdateManifestSignatures(info, [parsePrivateKey(key.privateKeyPem)])
  return serializeToYaml({ ...info, signature: signatures[0].signature, signatures }, false, true)
}

async function releaseDir(prefix: string, tmpDir: any): Promise<{ dir: string; installer: string; sha512: string }> {
  const dir = await tmpDir.getTempDir({ prefix })
  const installer = await write(path.join(dir, "My Setup 1.0.0.exe"), "installer bytes")
  return { dir, installer, sha512: await hashFile(installer) }
}

const run = (...files: Array<string>) => warnAboutUpdateFilesBeforeUpload(createUploadTasks(files.map(file => ({ file, arch: null }))))
const calls = (): Array<[any, string | undefined]> => warn.mock.calls as Array<[any, string | undefined]>
const announcements = () => calls().filter(([message]) => typeof message === "string" && message.startsWith(ANNOUNCEMENT))
const mismatches = () =>
  calls()
    .filter(([, message]) => typeof message === "string" && message.startsWith(MISMATCH))
    .map(([fields]) => fields)

describe("warnAboutUpdateFilesBeforeUpload", () => {
  test("announces the rules for update info, a channel's update info and update files alone, once per process", async ({ expect, tmpDir }) => {
    const { dir, installer, sha512 } = await releaseDir("update-files-upload", tmpDir)
    const files = [{ url: "My-Setup-1.0.0.exe", sha512, size: 15 }]
    const latest = await write(path.join(dir, "latest.yml"), updateInfo({ version: "1.0.0", files }))
    const beta = await write(path.join(dir, "alpha-linux.yml"), updateInfo({ version: "1.0.0-alpha.1", files }))
    const blockMap = await write(path.join(dir, "My Setup 1.0.0.exe.blockmap"), "map")

    await run(latest)
    expect(announcements()).toHaveLength(1)
    const [message] = announcements()[0]
    for (const rule of ["sha512 and size describe the uploaded bytes", "sign it again instead of editing it", "without YAML aliases", "served over https"]) {
      expect(message).toContain(rule)
    }
    expect(message).toContain("https://www.electron.build/docs/migration/v27-runtime-changes#full-downloads-stop-at-the-declared-size")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-build-changes#signed-update-manifests-are-required")
    // once per process
    await run(beta)
    await run(installer, blockMap)
    expect(announcements()).toHaveLength(1)

    for (const files of [[beta], [installer], [blockMap]]) {
      log.resetLimits("update-files-upload")
      warn.mockClear()
      await run(...files)
      expect(announcements()).toHaveLength(1)
    }
    expect(mismatches()).toEqual([])
  })

  test("does not warn about files that are not update files", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "update-files-upload" })
    await run(
      await write(path.join(dir, "My-1.0.0.dmg"), "dmg"),
      await write(path.join(dir, "notes.yml"), "title: release notes\n"),
      await write(path.join(dir, "app-update.yml"), "provider: generic\nurl: https://example.com\n"),
      await write(path.join(dir, "checksums.txt"), "abc")
    )
    expect(warn).not.toHaveBeenCalled()
  })

  test("names each uploaded file whose size or sha512 differs from its update info, matched by its safe artifact name", async ({ expect, tmpDir }) => {
    const { dir, installer, sha512 } = await releaseDir("update-files-upload", tmpDir)
    const webPackage = await write(path.join(dir, "my-1.0.0-x64.nsis.7z"), "package")
    const latest = await write(
      path.join(dir, "latest.yml"),
      updateInfo({
        version: "1.0.0",
        // the installer signed again after the build: the sha512 was updated, the size was not
        files: [
          { url: "My-Setup-1.0.0.exe", sha512, size: 10 },
          { url: "not-uploaded.exe", sha512: "AAAA", size: 1 },
        ],
        packages: {
          x64: { path: "my-1.0.0-x64.nsis.7z", sha512: "AAAA", size: 7 },
        },
      })
    )
    await run(installer, webPackage, latest)
    expect(mismatches()).toEqual([
      {
        updateInfo: log.filePath(latest),
        file: log.filePath(installer),
        mismatched: "size",
      },
      {
        updateInfo: log.filePath(latest),
        file: log.filePath(webPackage),
        mismatched: "sha512",
      },
    ])
    const message = calls().find(([, message]) => typeof message === "string" && message.startsWith(MISMATCH))?.[1]
    expect(message).toContain("regenerate its size and sha512 together and sign the update info again")
  })

  test("matches a full url and reports both fields", async ({ expect, tmpDir }) => {
    const { dir, installer } = await releaseDir("update-files-upload", tmpDir)
    const latest = await write(
      path.join(dir, "latest.yml"),
      updateInfo({
        version: "1.0.0",
        files: [
          {
            url: "https://example.com/updates/My-Setup-1.0.0.exe?x=1",
            sha512: "AAAA",
            size: 99,
          },
        ],
      })
    )
    await run(latest, installer)
    expect(mismatches()).toEqual([
      {
        updateInfo: log.filePath(latest),
        file: log.filePath(installer),
        mismatched: "size, sha512",
      },
    ])
  })

  test("warns about YAML aliases", async ({ expect, tmpDir }) => {
    const { dir, sha512 } = await releaseDir("update-files-upload", tmpDir)
    const aliased = await write(
      path.join(dir, "latest-mac.yml"),
      `version: 1.0.0\nreleaseNotes: &notes "notes"\nreleaseName: *notes\nfiles:\n  - url: My-Setup-1.0.0.exe\n    sha512: ${sha512}\n    size: 15\n`
    )
    const plain = await write(
      path.join(dir, "latest.yml"),
      updateInfo({
        version: "1.0.0",
        releaseNotes: "a & b *c*",
        files: [{ url: "x.zip", sha512, size: 1 }],
      })
    )
    await run(aliased, plain)
    const aliasWarnings = calls().filter(([, message]) => typeof message === "string" && message.startsWith("update info uses YAML aliases"))
    expect(aliasWarnings.map(([fields]) => fields)).toEqual([{ file: log.filePath(aliased) }])
  })

  test("warns about malformed update info without throwing", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "update-files-upload" })
    const broken = await write(path.join(dir, "latest.yml"), "files: [unclosed\n")
    const wrongShape = await write(
      path.join(dir, "beta.yml"),
      "version: 1.0.0\nfiles:\n  - 42\n  - null\n  - url: [1]\n  - url: gone.exe\n    size: 1\n  - url: folder.exe\n    sha512: AAAA\npackages: 7\n"
    )
    // listed files that are uploaded but cannot be read: a missing file and a directory are left to the upload to report
    const folder = path.join(dir, "folder.exe")
    await mkdir(folder)
    await expect(run(broken, wrongShape, path.join(dir, "missing.yml"), path.join(dir, "gone.exe"), folder)).resolves.toBeUndefined()
    expect(
      calls()
        .filter(([, message]) => typeof message === "string" && message.startsWith("cannot read this .yml"))
        .map(([fields]) => fields.file)
    ).toEqual([log.filePath(broken), log.filePath(path.join(dir, "missing.yml"))])
    expect(mismatches()).toEqual([])
  })

  test("skips a listed file that can be stat-ed but not read, and checks the next one", async ({ expect, tmpDir }) => {
    const { dir, installer } = await releaseDir("update-files-upload", tmpDir)
    const other = await write(path.join(dir, "other.exe"), "other")
    const latest = await write(
      path.join(dir, "latest.yml"),
      updateInfo({
        version: "1.0.0",
        files: [
          { url: "My-Setup-1.0.0.exe", sha512: "AAAA", size: 15 },
          { url: "other.exe", sha512: "AAAA", size: 5 },
        ],
      })
    )
    // the installer, hashed first, is removed or unreadable between stat and read
    vi.mocked(hashFile).mockRejectedValueOnce(Object.assign(new Error(`EACCES: permission denied, open '${installer}'`), { code: "EACCES" }))
    await expect(run(installer, other, latest)).resolves.toBeUndefined()
    expect(
      vi
        .mocked(hashFile)
        .mock.calls.slice(-2)
        .map(([file]) => file)
    ).toEqual([installer, other])
    expect(mismatches()).toEqual([{ updateInfo: log.filePath(latest), file: log.filePath(other), mismatched: "sha512" }])
  })
})

describe("electron-builder publish", () => {
  test("warns before the update manifest check can refuse the upload", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({
      prefix: "update-files-upload-project",
    })
    await write(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "upload-test",
        version: "1.0.0",
        description: "test",
        author: "test",
      })
    )
    const artifact = await write(path.join(projectDir, "dist", "My-1.0.0.AppImage"), "AppImage")
    // unsigned, so the upload is refused after the warnings
    const latest = await write(
      path.join(projectDir, "dist", "latest-linux.yml"),
      serializeToYaml(
        {
          version: "1.0.0",
          files: [
            {
              url: "My-1.0.0.AppImage",
              sha512: await hashFile(artifact),
              size: 1,
            },
          ],
        },
        false,
        true
      )
    )
    const options = {
      projectDir,
      config: {
        publish: { provider: "generic", url: "https://example.com/updates" },
      },
    } as any
    const tasks = createUploadTasks([
      { file: artifact, arch: null },
      { file: latest, arch: null },
    ])
    await expect(publishPackageWithTasks(options, tasks, undefined, undefined, new Packager(options))).rejects.toThrow("is an unsigned update manifest")
    expect(announcements()).toHaveLength(1)
    expect(mismatches()).toEqual([
      {
        updateInfo: log.filePath(latest),
        file: log.filePath(artifact),
        mismatched: "size",
      },
    ])
  })
})
