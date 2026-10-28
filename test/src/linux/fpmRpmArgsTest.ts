import { describe, expect, test, vi } from "vitest"

// fpm itself is not run: capture the command line it would get
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn(() => Promise.resolve("")) }
})
vi.mock("app-builder-lib/src/toolsets/linux", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/linux")>()
  return { ...actual, getFpmPath: () => Promise.resolve("fpm") }
})

import FpmTarget from "app-builder-lib/src/targets/FpmTarget"
import { exec } from "builder-util"

async function fpmArgsFor(target: string, args: Array<string>): Promise<Array<string>> {
  const fpm: any = Object.create(FpmTarget.prototype)
  fpm.packager = { config: {}, buildResourcesDir: "build" }
  vi.mocked(exec).mockClear()
  await fpm.executeFpm(target, { target, args }, {})
  expect(exec).toHaveBeenCalledTimes(1)
  return vi.mocked(exec).mock.calls[0][1] as Array<string>
}

function defineIndices(args: Array<string>, define: string): Array<number> {
  return args.flatMap((it, i) => (it === "--rpm-rpmbuild-define" && args[i + 1] === define ? [i] : []))
}

describe("FpmTarget rpm args (#10471)", () => {
  test("rpm disables build-id links and pins the v4 package format", async () => {
    const args = await fpmArgsFor("rpm", [])
    expect(defineIndices(args, "_build_id_links none")).toHaveLength(1)
    expect(defineIndices(args, "_rpmformat 4")).toHaveLength(1)
  })

  test("user rpm.fpm args come after the built-in defines, so a user define wins", async () => {
    const userDefine = "--rpm-rpmbuild-define=_build_id_links compat"
    const args = await fpmArgsFor("rpm", [userDefine, "/app/=/opt/app"])
    const builtIn = defineIndices(args, "_build_id_links none")[0]
    expect(builtIn).toBeGreaterThanOrEqual(0)
    expect(args.indexOf(userDefine)).toBeGreaterThan(builtIn)
    expect(args.indexOf(userDefine)).toBeGreaterThan(defineIndices(args, "_rpmformat 4")[0])
  })

  test("deb and pacman get no rpmbuild defines", async () => {
    for (const target of ["deb", "pacman"]) {
      expect(await fpmArgsFor(target, [])).not.toContain("--rpm-rpmbuild-define")
    }
  })
})
