import { exec, spawn } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { SnapStoreOptions } from "builder-util-runtime/out/publishOptions"
import { PublishContext, UploadTask } from "electron-publish"
import { beforeEach, describe, test, vi } from "vitest"
// Import from source so Vitest's vi.mock intercepts builder-util in the same module graph
import { SnapStorePublisher } from "../../../../packages/electron-publish/src/snapStorePublisher"

vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return { ...actual, exec: vi.fn(), spawn: vi.fn() }
})

function makeContext(): PublishContext {
  return { cancellationToken: new CancellationToken(), progress: null }
}

function makeTask(file = "/tmp/app_1.0.0_amd64.snap"): UploadTask {
  return { file, arch: null }
}

function makePublisher(channels?: SnapStoreOptions["channels"], cscLink?: string): SnapStorePublisher {
  return new SnapStorePublisher(makeContext(), { provider: "snapStore", channels }, { cscLink, resourcesDir: "/resources" })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: snapcraft is installed at a valid version
  vi.mocked(exec).mockResolvedValue("snapcraft, version 8.4.0\n")
  vi.mocked(spawn).mockResolvedValue(undefined)
})

describe("SnapStorePublisher", () => {
  describe("Identity", () => {
    test("providerName is snapStore", ({ expect }) => {
      expect(makePublisher().providerName).toBe("snapStore")
    })

    test("toString returns Snap Store", ({ expect }) => {
      expect(makePublisher().toString()).toBe("Snap Store")
    })
  })

  describe("checkSnapcraft — version parsing", () => {
    test("accepts edge version string (fast path)", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version edge")
      await expect(makePublisher().upload(makeTask())).resolves.toBeUndefined()
    })

    test("accepts modern format without comma (snapcraft 8.14.4)", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft 8.14.4")
      await expect(makePublisher().upload(makeTask())).resolves.toBeUndefined()
    })

    test("accepts old comma format (snapcraft, version 7.3.0)", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version 7.3.0")
      await expect(makePublisher().upload(makeTask())).resolves.toBeUndefined()
    })

    test("accepts quoted version format (snapcraft, version '7.3.0')", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version '7.3.0'")
      await expect(makePublisher().upload(makeTask())).resolves.toBeUndefined()
    })

    test("accepts exactly 7.0.0 (boundary)", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version 7.0.0")
      await expect(makePublisher().upload(makeTask())).resolves.toBeUndefined()
    })

    test("rejects version 6.9.9 with descriptive error", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version 6.9.9")
      await expect(makePublisher().upload(makeTask())).rejects.toThrow(/at least snapcraft 7\.0\.0 is required/)
    })

    test("error for outdated version includes the installed version string", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version 3.9.9")
      await expect(makePublisher().upload(makeTask())).rejects.toThrow(/snapcraft, version 3\.9\.9/)
    })

    test("throws when snapcraft is not installed", async ({ expect }) => {
      vi.mocked(exec).mockRejectedValue(new Error("ENOENT: snapcraft not found"))
      await expect(makePublisher().upload(makeTask())).rejects.toThrow(/snapcraft is not installed/)
    })

    test("install hint on macOS is brew install snapcraft", async ({ expect }) => {
      const originalPlatform = process.platform
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
      vi.mocked(exec).mockRejectedValue(new Error("ENOENT"))

      try {
        await expect(makePublisher().upload(makeTask())).rejects.toThrow(/brew install snapcraft/)
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
      }
    })

    test("install hint on Linux is sudo snap install snapcraft --classic", async ({ expect }) => {
      const originalPlatform = process.platform
      Object.defineProperty(process, "platform", { value: "linux", configurable: true })
      vi.mocked(exec).mockRejectedValue(new Error("ENOENT"))

      try {
        await expect(makePublisher().upload(makeTask())).rejects.toThrow(/sudo snap install snapcraft --classic/)
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
      }
    })

    test("outdated version hint on macOS is brew install snapcraft", async ({ expect }) => {
      const originalPlatform = process.platform
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
      vi.mocked(exec).mockResolvedValue("snapcraft, version 3.0.0")

      try {
        await expect(makePublisher().upload(makeTask())).rejects.toThrow(/brew install snapcraft/)
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
      }
    })
  })

  describe("upload — channel handling", () => {
    const FILE = makeTask().file
    const STDIO = { stdio: ["ignore", "inherit", "inherit"] }

    function expectSpawnCall(args: string[]) {
      return (expect: any) => {
        expect(vi.mocked(spawn)).toHaveBeenCalledWith("snapcraft", args, expect.objectContaining(STDIO))
      }
    }

    test("defaults to edge when channels is null", async ({ expect }) => {
      await makePublisher(null).upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "edge"])(expect)
    })

    test("defaults to edge when channels is undefined", async ({ expect }) => {
      await makePublisher(undefined).upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "edge"])(expect)
    })

    test("handles single string channel", async ({ expect }) => {
      await makePublisher("stable").upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "stable"])(expect)
    })

    test("handles comma-separated string channels", async ({ expect }) => {
      await makePublisher("stable,beta").upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "stable,beta"])(expect)
    })

    test("handles single-element array", async ({ expect }) => {
      await makePublisher(["candidate"]).upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "candidate"])(expect)
    })

    test("handles multi-element array joined as comma-separated", async ({ expect }) => {
      await makePublisher(["stable", "candidate", "beta"]).upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "stable,candidate,beta"])(expect)
    })

    test("empty array omits --release flag entirely", async ({ expect }) => {
      await makePublisher([]).upload(makeTask())
      expect(vi.mocked(spawn)).toHaveBeenCalledWith("snapcraft", ["upload", FILE], expect.objectContaining(STDIO))
    })

    test("passes the snap file path as the second argument", async ({ expect }) => {
      const file = "/build/output/myapp_2.0.0_amd64.snap"
      await makePublisher().upload(makeTask(file))
      expect(vi.mocked(spawn)).toHaveBeenCalledWith("snapcraft", ["upload", file, "--release", "edge"], expect.objectContaining(STDIO))
    })

    test("full command: upload <file> --release <channel>", async ({ expect }) => {
      const file = "/tmp/app.snap"
      await makePublisher("edge").upload(makeTask(file))
      expect(vi.mocked(spawn)).toHaveBeenCalledWith("snapcraft", ["upload", file, "--release", "edge"], expect.objectContaining(STDIO))
    })

    test("supports track/risk format (2.0/beta)", async ({ expect }) => {
      await makePublisher("2.0/beta").upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "2.0/beta"])(expect)
    })

    test("supports track/risk/branch format (latest/stable/fix-123)", async ({ expect }) => {
      await makePublisher("latest/stable/fix-123").upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "latest/stable/fix-123"])(expect)
    })

    test("supports multiple complex channels as array", async ({ expect }) => {
      await makePublisher(["latest/stable", "2.0/candidate", "3.0/beta/hotfix"]).upload(makeTask())
      expectSpawnCall(["upload", FILE, "--release", "latest/stable,2.0/candidate,3.0/beta/hotfix"])(expect)
    })

    test("passes inherit stdio so snapcraft output streams to terminal", async ({ expect }) => {
      await makePublisher().upload(makeTask())
      expect(vi.mocked(spawn)).toHaveBeenCalledWith("snapcraft", expect.any(Array), expect.objectContaining(STDIO))
    })
  })

  describe("credential injection", () => {
    const CREDS = "snapcraft-login-token-content"
    const BASE64 = Buffer.from(CREDS).toString("base64")

    test("no cscLink and no SNAP_CSC_LINK → inherits process.env unchanged", async ({ expect }) => {
      await makePublisher().upload(makeTask())
      const spawnEnv = vi.mocked(spawn).mock.calls[0][2] as any
      expect(spawnEnv.env).not.toHaveProperty("SNAPCRAFT_STORE_CREDENTIALS")
    })

    test("cscLink base64 → SNAPCRAFT_STORE_CREDENTIALS injected into spawn env", async ({ expect }) => {
      await makePublisher(undefined, BASE64).upload(makeTask())
      const spawnEnv = vi.mocked(spawn).mock.calls[0][2] as any
      expect(spawnEnv.env.SNAPCRAFT_STORE_CREDENTIALS).toBe(CREDS)
    })

    test("SNAP_CSC_LINK env var base64 → SNAPCRAFT_STORE_CREDENTIALS injected", async ({ expect }) => {
      const original = process.env.SNAP_CSC_LINK
      process.env.SNAP_CSC_LINK = BASE64
      try {
        await makePublisher().upload(makeTask())
        const spawnEnv = vi.mocked(spawn).mock.calls[0][2] as any
        expect(spawnEnv.env.SNAPCRAFT_STORE_CREDENTIALS).toBe(CREDS)
      } finally {
        if (original === undefined) {
          delete process.env.SNAP_CSC_LINK
        } else {
          process.env.SNAP_CSC_LINK = original
        }
      }
    })

    test("cscLink takes priority over SNAP_CSC_LINK", async ({ expect }) => {
      const original = process.env.SNAP_CSC_LINK
      process.env.SNAP_CSC_LINK = Buffer.from("from-env").toString("base64")
      try {
        await makePublisher(undefined, BASE64).upload(makeTask())
        const spawnEnv = vi.mocked(spawn).mock.calls[0][2] as any
        expect(spawnEnv.env.SNAPCRAFT_STORE_CREDENTIALS).toBe(CREDS)
      } finally {
        if (original === undefined) {
          delete process.env.SNAP_CSC_LINK
        } else {
          process.env.SNAP_CSC_LINK = original
        }
      }
    })

    test("empty decoded credentials → rejects with descriptive error", async ({ expect }) => {
      // "  " encodes to "ICA=" (ends with "="), so the isBase64 heuristic fires
      const emptyBase64 = Buffer.from("  ").toString("base64")
      await expect(makePublisher(undefined, emptyBase64).upload(makeTask())).rejects.toThrow(/empty/)
    })

    test("absolute file path → reads file and injects credentials", async ({ expect }) => {
      const { writeFile, mkdtemp, rm } = await import("fs/promises")
      const { tmpdir } = await import("os")
      const dir = await mkdtemp(`${tmpdir()}/snap-csc-test-`)
      const file = `${dir}/creds.txt`
      try {
        await writeFile(file, CREDS, "utf8")
        await makePublisher(undefined, file).upload(makeTask())
        const spawnEnv = vi.mocked(spawn).mock.calls[0][2] as any
        expect(spawnEnv.env.SNAPCRAFT_STORE_CREDENTIALS).toBe(CREDS)
      } finally {
        await rm(dir, { recursive: true })
      }
    })
  })

  describe("upload — error handling", () => {
    test("rejects when snapcraft upload fails", async ({ expect }) => {
      vi.mocked(spawn).mockRejectedValue(new Error("Exit code: 1. snapcraft upload failed"))
      await expect(makePublisher().upload(makeTask())).rejects.toThrow(/snapcraft upload failed/)
    })

    test("rejects when checkSnapcraft fails (not installed)", async ({ expect }) => {
      vi.mocked(exec).mockRejectedValue(new Error("ENOENT"))
      vi.mocked(spawn).mockResolvedValue(undefined)
      await expect(makePublisher().upload(makeTask())).rejects.toThrow(/snapcraft is not installed/)
      expect(vi.mocked(spawn)).not.toHaveBeenCalled()
    })

    test("does not call spawn when version check fails", async ({ expect }) => {
      vi.mocked(exec).mockResolvedValue("snapcraft, version 1.2.3")
      await expect(makePublisher().upload(makeTask())).rejects.toThrow()
      expect(vi.mocked(spawn)).not.toHaveBeenCalled()
    })
  })
})
