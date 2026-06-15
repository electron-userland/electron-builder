import { ensureDir } from "builder-util/src/fs"
import { vi } from "vitest"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

const codeError = (code: string) => Object.assign(new Error(`${code}: simulated`), { code })

describe("ensureDir", () => {
  test("creates the directory (recursive) on the happy path", async ({ expect }) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "eb-ensuredir-"))
    try {
      const nested = path.join(base, "a", "b", "c")
      await ensureDir(nested)
      expect((await fs.stat(nested)).isDirectory()).toBe(true)
    } finally {
      await fs.rm(base, { recursive: true, force: true })
    }
  })

  test("retries through the spurious ENOENT thrown by concurrent recursive mkdir", async ({ expect }) => {
    // nodejs/node#27293: a peer is mid-creating a shared ancestor, so the first two recursive
    // mkdir calls fail with ENOENT before the tree settles and the third succeeds.
    const mkdir = vi.fn().mockRejectedValueOnce(codeError("ENOENT")).mockRejectedValueOnce(codeError("ENOENT")).mockResolvedValueOnce(undefined)
    await expect(ensureDir("/cold/cache/path", 8, mkdir)).resolves.toBeUndefined()
    expect(mkdir).toHaveBeenCalledTimes(3)
  })

  test("treats a spurious EEXIST as success when the path is already a directory", async ({ expect }) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "eb-ensuredir-"))
    try {
      // The dir genuinely exists (real fs.stat → directory); the race makes mkdir throw EEXIST.
      const mkdir = vi.fn().mockRejectedValue(codeError("EEXIST"))
      await expect(ensureDir(base, 8, mkdir)).resolves.toBeUndefined()
    } finally {
      await fs.rm(base, { recursive: true, force: true })
    }
  })

  test("gives up after maxAttempts so a persistent ENOENT is not masked forever", async ({ expect }) => {
    const mkdir = vi.fn().mockRejectedValue(codeError("ENOENT"))
    await expect(ensureDir("/persistently/missing", 2, mkdir)).rejects.toThrow("ENOENT")
    expect(mkdir).toHaveBeenCalledTimes(3) // initial attempt + 2 retries
  })

  test("does not retry on a non-transient error (e.g. EACCES)", async ({ expect }) => {
    const mkdir = vi.fn().mockRejectedValue(codeError("EACCES"))
    await expect(ensureDir("/no/permission", 8, mkdir)).rejects.toThrow("EACCES")
    expect(mkdir).toHaveBeenCalledTimes(1)
  })
})