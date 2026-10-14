import { Platform } from "app-builder-lib"
import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { orderAsarStreams } from "app-builder-lib/src/asar/asarUtil"
import * as fs from "fs/promises"
import * as path from "path"
import { app, linuxDirTarget } from "./helpers/packTester.js"

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
