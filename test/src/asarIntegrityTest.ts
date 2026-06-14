import { Platform } from "app-builder-lib"
import { AsarFilesystem, readAsar } from "app-builder-lib/internal"
import { createHash } from "crypto"
import * as path from "path"
import { ExpectStatic } from "vitest"
import { app, linuxDirTarget } from "./helpers/packTester.js"

// Regression guard for a per-file ASAR integrity corruption introduced in @electron/asar >= 4.1.2.
//
// That version added a synchronous "fast path" to Filesystem.insertFile that computes a packed
// file's embedded integrity from `fs.readFileSync(p)`, where `p` is the file's *destination* path
// inside the archive. When packing from streams (electron-builder's code path), the real content
// comes from the stream, not from `p`, so the read resolves `p` against the process CWD. If the CWD
// happens to contain a file at the same relative path (e.g. `package.json`, `node_modules/<dep>/...`,
// which is the common case when building a project), the header records the integrity of the *wrong*
// file while the archive stores the correct bytes. With `enableEmbeddedAsarIntegrityValidation`,
// Electron then rejects app.asar at launch and the app exits immediately with no output.
//
// We pin @electron/asar to 4.1.1 (last version computing integrity from the stream). This test fails
// if a future bump reintroduces the regression: it asserts every packed file's embedded integrity
// hash matches the bytes actually stored in the archive.
async function verifyAsarPerFileIntegrity(expect: ExpectStatic, resourceDir: string) {
  const asarFs: AsarFilesystem = await readAsar(path.join(resourceDir, "app.asar"))

  const mismatches: Array<{ file: string; expected: string; actual: string }> = []
  let packedFilesChecked = 0

  const walk = async (node: any, prefix: string): Promise<void> => {
    for (const [name, child] of Object.entries<any>(node.files ?? {})) {
      const relativePath = prefix ? path.join(prefix, name) : name
      if (child.files != null) {
        await walk(child, relativePath)
        continue
      }
      // Only packed regular files carry an offset into the archive. Skip symlinks (`link`) and
      // unpacked files (`unpacked`) — those are stored on disk, not inside app.asar.
      if (child.link != null || child.unpacked || child.integrity == null || child.offset == null) {
        continue
      }
      packedFilesChecked++
      const bytes = await asarFs.readFile(relativePath)
      const actual = createHash("sha256").update(bytes).digest("hex")
      if (actual !== child.integrity.hash) {
        mismatches.push({ file: relativePath, expected: child.integrity.hash, actual })
      }
    }
  }

  await walk(asarFs.header, "")

  // Sanity: ensure we actually exercised packed files (otherwise the assertion below is vacuous).
  expect(packedFilesChecked).toBeGreaterThan(0)
  expect(mismatches).toEqual([])
}

test.ifNotWindows("embedded asar integrity matches archived content", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: {},
      },
    },
    {
      packed: context => verifyAsarPerFileIntegrity(expect, context.getResources(Platform.LINUX)),
    }
  )
)
