import * as fsp from "fs/promises"
import * as os from "os"
import * as path from "path"
import { createUpdateInfoTasks, writeUpdateInfoFiles, UpdateInfoFileTask } from "app-builder-lib/src/publish/updateInfoBuilder"
import { Platform } from "app-builder-lib"
import { Arch } from "builder-util"
import { load as yamlLoad } from "js-yaml"
import { vi } from "vitest"

const basePublishConfig = { provider: "s3", bucket: "test-bucket" } as const

function makeTask(dir: string, url: string, sha512: string, arch: Arch | null, filename = "latest.yml"): UpdateInfoFileTask {
  return {
    file: path.join(dir, filename),
    info: {
      version: "1.0.0",
      files: [{ url, sha512 }],
      path: url,
      sha512,
    } as any,
    publishConfiguration: basePublishConfig as any,
    packager: {} as any,
    arch,
  }
}

function makePackager() {
  return { emitArtifactCreated: vi.fn().mockResolvedValue(undefined) }
}

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "eb-updateinfo-"))
  try {
    return await fn(dir)
  } finally {
    await fsp.rm(dir, { recursive: true })
  }
}

async function readYml(filePath: string): Promise<any> {
  return yamlLoad(await fsp.readFile(filePath, "utf-8"))
}

// ── NSIS multi-arch ordering (issue #9745) ──────────────────────────────────

test("universal installer is first when tasks arrive as [arm64, x64, universal]", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0.exe")
    expect(yml.path).toBe("App-1.0.0.exe")
    expect(yml.sha512).toBe("sha-universal")
  })
})

test("universal installer is first when tasks arrive as [universal, x64, arm64]", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0.exe")
    expect(yml.path).toBe("App-1.0.0.exe")
    expect(yml.sha512).toBe("sha-universal")
  })
})

test("universal installer is first when tasks arrive as [x64, universal, arm64]", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0.exe")
    expect(yml.path).toBe("App-1.0.0.exe")
    expect(yml.sha512).toBe("sha-universal")
  })
})

test("all three NSIS multi-arch installer urls are present in files array", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    // universal first, then by Arch enum value: x64 (1) before arm64 (3)
    expect(yml.files.map((f: any) => f.url)).toEqual(["App-1.0.0.exe", "App-1.0.0-x64.exe", "App-1.0.0-arm64.exe"])
  })
})

// ── macOS zip-first behavior (backward compat) ──────────────────────────────

test("zip file appears before non-zip when zip arrives after exe", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0.dmg", "sha-dmg", Arch.x64), makeTask(dir, "App-1.0.0-mac.zip", "sha-zip", null)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0-mac.zip")
    expect(yml.path).toBe("App-1.0.0-mac.zip")
    expect(yml.sha512).toBe("sha-zip")
  })
})

test("zip file remains first when it already arrives before non-zip", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0-mac.zip", "sha-zip", null), makeTask(dir, "App-1.0.0.dmg", "sha-dmg", Arch.x64)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files[0].url).toBe("App-1.0.0-mac.zip")
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

test("single installer produces one-entry files array", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files).toHaveLength(1)
    expect(yml.files[0].url).toBe("App-1.0.0-x64.exe")
    expect(yml.path).toBe("App-1.0.0-x64.exe")
  })
})

test("arch-specific only (no universal) – all entries present", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [makeTask(dir, "App-1.0.0-arm64.exe", "sha-arm64", Arch.arm64), makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64)]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.files).toHaveLength(2)
    const urls: string[] = yml.files.map((f: any) => f.url)
    expect(urls).toContain("App-1.0.0-arm64.exe")
    expect(urls).toContain("App-1.0.0-x64.exe")
  })
})

test("publishAutoUpdate: false skips writing the yml", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks: UpdateInfoFileTask[] = [
      {
        file: path.join(dir, "latest.yml"),
        info: { version: "1.0.0", files: [{ url: "App.exe", sha512: "sha" }], path: "App.exe", sha512: "sha" } as any,
        publishConfiguration: { provider: "s3", bucket: "test", publishAutoUpdate: false } as any,
        packager: {} as any,
        arch: null,
      },
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const exists = await fsp
      .access(path.join(dir, "latest.yml"))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })
})

test("releaseDate is populated when not provided", async ({ expect }) => {
  await withTmpDir(async dir => {
    const before = new Date()
    await writeUpdateInfoFiles([makeTask(dir, "App.exe", "sha", null)], makePackager() as any)
    const after = new Date()
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.releaseDate).toBeDefined()
    const written = new Date(yml.releaseDate)
    expect(written.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(written.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})

test("existing releaseDate is not overwritten", async ({ expect }) => {
  await withTmpDir(async dir => {
    const task = makeTask(dir, "App.exe", "sha", null)
    const existingDate = "2024-01-15T10:00:00.000Z"
    ;(task.info as any).releaseDate = existingDate
    await writeUpdateInfoFiles([task], makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    expect(yml.releaseDate).toBe(existingDate)
  })
})

test("tasks for different yml files are written independently", async ({ expect }) => {
  await withTmpDir(async dir => {
    const latestTask = makeTask(dir, "App-1.0.0.exe", "sha-latest", null, "latest.yml")
    const betaTask = {
      ...makeTask(dir, "App-1.0.0-beta.exe", "sha-beta", null, "beta.yml"),
      publishConfiguration: { provider: "s3", bucket: "other-bucket" } as any,
    }
    await writeUpdateInfoFiles([latestTask, betaTask], makePackager() as any)
    const latest = await readYml(path.join(dir, "latest.yml"))
    const beta = await readYml(path.join(dir, "beta.yml"))
    expect(latest.files[0].url).toBe("App-1.0.0.exe")
    expect(beta.files[0].url).toBe("App-1.0.0-beta.exe")
  })
})

test("emitArtifactCreated is called once per unique yml file", async ({ expect }) => {
  await withTmpDir(async dir => {
    const mockPackager = makePackager()
    const tasks = [
      makeTask(dir, "App-1.0.0.exe", "sha-universal", null, "latest.yml"),
      makeTask(dir, "App-1.0.0-x64.exe", "sha-x64", Arch.x64, "latest.yml"),
      makeTask(dir, "App-1.0.0-beta.exe", "sha-beta", null, "beta.yml"),
    ]
    // Override beta to use a different publish config so it gets a separate key
    ;(tasks[2] as any).publishConfiguration = { provider: "s3", bucket: "beta-bucket" }
    await writeUpdateInfoFiles(tasks, mockPackager as any)
    // latest.yml (universal + x64 merged) + beta.yml = 2 writes
    expect(mockPackager.emitArtifactCreated).toHaveBeenCalledTimes(2)
  })
})

// ── createUpdateInfoTasks unit tests ─────────────────────────────────────────

function makePlatformPackager(): any {
  return {
    appInfo: { version: "1.0.0" },
    platform: Platform.WINDOWS,
    platformSpecificBuildOptions: { releaseInfo: undefined, electronUpdaterCompatibility: ">=2.16", generateUpdatesFilesForAllChannels: undefined },
    config: { releaseInfo: undefined, generateUpdatesFilesForAllChannels: undefined },
    info: {},
    getResource: () => Promise.resolve(null),
  }
}

test("createUpdateInfoTasks passes event.arch to the created task", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0-arm64.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: Arch.arm64, packager: makePlatformPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].arch).toBe(Arch.arm64)
  })
})

test("createUpdateInfoTasks sets arch null for universal installer", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = { file: artifactFile, arch: null, packager: makePlatformPackager(), target: { outDir: dir } }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "s3", bucket: "test" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].arch).toBeNull()
  })
})

test("createUpdateInfoTasks GitHub provider overrides url and path with safeArtifactName", async ({ expect }) => {
  await withTmpDir(async dir => {
    const artifactFile = path.join(dir, "App-1.0.0.exe")
    await fsp.writeFile(artifactFile, "fake")
    const event: any = {
      file: artifactFile,
      arch: null,
      safeArtifactName: "app-1.0.0.exe",
      packager: makePlatformPackager(),
      target: { outDir: dir },
    }
    const tasks = await createUpdateInfoTasks(event, [{ provider: "github", repo: "owner/repo" }] as any)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].info.files[0].url).toBe("app-1.0.0.exe")
    expect((tasks[0].info as any).path).toBe("app-1.0.0.exe")
  })
})

test("empty tasks array is a no-op", async ({ expect }) => {
  const mockPackager = makePackager()
  await expect(writeUpdateInfoFiles([], mockPackager as any)).resolves.toBeUndefined()
  expect(mockPackager.emitArtifactCreated).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────────────────────────

test("sha512 values are preserved correctly for each file entry", async ({ expect }) => {
  await withTmpDir(async dir => {
    const tasks = [
      makeTask(dir, "App-1.0.0-arm64.exe", "sha512-arm64-value", Arch.arm64),
      makeTask(dir, "App-1.0.0-x64.exe", "sha512-x64-value", Arch.x64),
      makeTask(dir, "App-1.0.0.exe", "sha512-universal-value", null),
    ]
    await writeUpdateInfoFiles(tasks, makePackager() as any)
    const yml = await readYml(path.join(dir, "latest.yml"))
    const byUrl = Object.fromEntries(yml.files.map((f: any) => [f.url, f.sha512]))
    expect(byUrl["App-1.0.0.exe"]).toBe("sha512-universal-value")
    expect(byUrl["App-1.0.0-x64.exe"]).toBe("sha512-x64-value")
    expect(byUrl["App-1.0.0-arm64.exe"]).toBe("sha512-arm64-value")
  })
})
