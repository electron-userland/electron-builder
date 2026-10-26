import { Platform, PlatformPackager } from "app-builder-lib"
import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { applyAsarOrdering, orderAsarStreams } from "app-builder-lib/src/asar/asarUtil"
import { InvalidConfigurationError, log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"
import { app, appThrows, linuxDirTarget } from "./helpers/packTester.js"

type AsarStreamType = Parameters<typeof orderAsarStreams>[0][number]

const dir = (p: string): AsarStreamType => ({ type: "directory", path: p, unpacked: false })
const file = (p: string): AsarStreamType => ({ type: "file", path: p, unpacked: false, streamGenerator: () => null as any, stat: { mode: 0o644, size: 1 } })

const paths = (streams: Array<AsarStreamType>) => streams.map(it => it.path)

describe("orderAsarStreams", () => {
  const streams = [dir("lib"), file("lib/a.js"), file("lib/b.js"), dir("src"), file("src/c.js"), file("main.js"), file("package.json")]

  test("listed files come first in ordering-file order, directories stay in front, the rest keeps its order", ({ expect }) => {
    const { streams: out, listed, matched } = orderAsarStreams(streams, ["main.js", "src/c.js"])
    expect(paths(out)).toEqual(["lib", "src", "main.js", "src/c.js", "lib/a.js", "lib/b.js", "package.json"])
    expect(listed).toBe(2)
    expect(matched).toBe(2)
  })

  test("accepts @electron/asar's line syntax: leading slash, `count: path` prefix, blank lines, duplicates", ({ expect }) => {
    const { streams: out, listed, matched } = orderAsarStreams(streams, ["", "  /lib/b.js  ", "3: main.js", "lib/b.js", "   "])
    expect(paths(out)).toEqual(["lib", "src", "lib/b.js", "main.js", "lib/a.js", "src/c.js", "package.json"])
    expect(listed).toBe(2)
    expect(matched).toBe(2)
  })

  test("files listed but absent are counted, not invented", ({ expect }) => {
    const { streams: out, listed, matched } = orderAsarStreams(streams, ["nope.js", "main.js"])
    expect(paths(out)).toEqual(["lib", "src", "main.js", "lib/a.js", "lib/b.js", "src/c.js", "package.json"])
    expect(listed).toBe(2)
    expect(matched).toBe(1)
  })

  test("an empty ordering is a no-op", ({ expect }) => {
    expect(paths(orderAsarStreams(streams, []).streams)).toEqual(paths(streams))
  })

  test("backslash separators from Windows-authored ordering files match", ({ expect }) => {
    const { streams: out, matched, missing } = orderAsarStreams(streams, ["src\\c.js", "\\lib\\b.js", "2: lib\\a.js"])
    expect(paths(out)).toEqual(["lib", "src", "src/c.js", "lib/b.js", "lib/a.js", "main.js", "package.json"])
    expect(matched).toBe(3)
    expect(missing).toEqual([])
  })

  test("lines naming a directory are neither listed nor reported missing", ({ expect }) => {
    const { streams: out, listed, matched, missing } = orderAsarStreams(streams, ["src", "main.js", "lib", "nope.js"])
    expect(paths(out)).toEqual(["lib", "src", "main.js", "lib/a.js", "lib/b.js", "src/c.js", "package.json"])
    expect(listed).toBe(2)
    expect(matched).toBe(1)
    expect(missing).toEqual(["nope.js"])
  })

  test("directory lines with a trailing separator are neither listed nor reported missing", ({ expect }) => {
    const { streams: out, listed, matched, missing } = orderAsarStreams(streams, ["src/", "main.js", "lib\\", "/src//", "nope.js"])
    expect(paths(out)).toEqual(["lib", "src", "main.js", "lib/a.js", "lib/b.js", "src/c.js", "package.json"])
    expect(listed).toBe(2)
    expect(matched).toBe(1)
    expect(missing).toEqual(["nope.js"])
  })
})

describe("applyAsarOrdering", () => {
  const MIGRATION_LINK = "https://www.electron.build/docs/migration/v27-build-changes#asar-ordering-is-now-applied"
  const streams = [dir("lib"), file("lib/a.js"), file("main.js")]

  /** A packager stub that resolves the ordering file with the real `getResource` (build resources dir first, then the project dir). */
  function fakePackager(projectDir: string): Parameters<typeof applyAsarOrdering>[0] {
    const buildResourcesDir = path.join(projectDir, "build")
    return { info: { buildResourcesDir }, buildResourcesDir, projectDir, resourceList: Promise.resolve([]), getResource: PlatformPackager.prototype.getResource } as any
  }

  beforeEach(() => log.resetLimits())
  afterEach(() => vi.restoreAllMocks())

  test("a missing ordering file is a configuration error naming the option, the paths tried and the migration notes", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "asar-ordering-missing" })
    const error = await applyAsarOrdering(fakePackager(projectDir), "order.txt", streams).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain('asar.ordering file "order.txt" was not found')
    expect(error.message).toContain(path.join(projectDir, "build", "order.txt"))
    expect(error.message).toContain(path.join(projectDir, "order.txt"))
    expect(error.message).toContain("relative to the build resources directory, then the project directory")
    expect(error.message).toContain(MIGRATION_LINK)
  })

  test("applies the ordering file and announces the v27 change once per process", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.createTempDir({ prefix: "asar-ordering-warn" })
    await fs.writeFile(path.join(projectDir, "order.txt"), "main.js\r\nlib/a.js\r\n")
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)

    expect(paths(await applyAsarOrdering(fakePackager(projectDir), "order.txt", streams))).toEqual(["lib", "main.js", "lib/a.js"])
    // a second packager (e.g. another platform in the same build) does not warn again
    await applyAsarOrdering(fakePackager(projectDir), "order.txt", streams)

    expect(warn).toHaveBeenCalledTimes(1)
    const message = warn.mock.calls[0][1] as string
    expect(message).toContain("asar.ordering is now applied")
    expect(message).toContain("electron-builder v26 and earlier silently ignored it")
    expect(message).toContain("dependencies-first layout")
    expect(message.endsWith(MIGRATION_LINK)).toBe(true)
  })
})

// End to end: `asar.ordering` really controls the pack order of the archive electron-builder writes.
function walkOffsets(node: any, prefix: string, into: Map<string, number>): void {
  for (const [name, child] of Object.entries<any>(node.files ?? {})) {
    const rel = prefix ? `${prefix}/${name}` : name
    if (child.files != null) {
      walkOffsets(child, rel, into)
    } else if (child.offset != null) {
      into.set(rel, parseInt(child.offset, 10))
    }
  }
}

test.ifNotWindows("asar.ordering packs listed files first", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: { ordering: "asar-order.txt" },
      },
    },
    {
      projectDirCreated: async projectDir => {
        for (const name of ["zeta.js", "alpha.js", "mid.js"]) {
          await fs.writeFile(path.join(projectDir, name), `// ${name}\n`.repeat(40))
        }
        await fs.writeFile(path.join(projectDir, "asar-order.txt"), "zeta.js\n/mid.js\n7: index.js\n")
      },
      packed: async context => {
        const asarFile = path.join(context.getResources(Platform.LINUX), "app.asar")
        const offsets = new Map<string, number>()
        walkOffsets(JSON.parse((await readAsarHeader(asarFile)).header), "", offsets)
        const byOffset = [...offsets].sort((a, b) => a[1] - b[1]).map(([rel]) => rel)
        expect(byOffset.slice(0, 3)).toEqual(["zeta.js", "mid.js", "index.js"])
        expect(byOffset.indexOf("alpha.js")).toBeGreaterThan(2)
      },
    }
  )
)

// v27 breaking change: a configured ordering file that does not exist fails the build (v26 ignored the option).
test.ifNotWindows("asar.ordering fails the build when the file is missing", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: { ordering: "no-such-order.txt" },
      },
    },
    {},
    error => {
      expect(error.message).toContain('asar.ordering file "no-such-order.txt" was not found')
      expect(error.message).toContain("v27-build-changes#asar-ordering-is-now-applied")
    }
  )
)
