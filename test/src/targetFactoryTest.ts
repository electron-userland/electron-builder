import { Arch, DEFAULT_TARGET, DIR_TARGET, Platform } from "app-builder-lib"
import { ArchType } from "builder-util"
import { BuildHost, computeArchToTargetNamesMap, resolveTargetNames, TargetNamesSource } from "app-builder-lib/src/targets/targetFactory"
import { normalizeOptions } from "electron-builder/src/builder"
import { describe, expect, test } from "vitest"

const nsisOnBothArchs: TargetNamesSource = { platformOptions: { target: [{ target: "nsis", arch: ["x64", "ia32"] }] }, defaultTarget: ["nsis"] }
const perArchTargets: TargetNamesSource["platformOptions"] = {
  target: [
    { target: "nsis", arch: "x64" },
    { target: "portable", arch: "ia32" },
  ],
}

function requestedArchs(platform: Platform, args: Parameters<typeof normalizeOptions>[0]): Map<Arch, Array<string>> {
  const archToType = normalizeOptions(args).targets?.get(platform)
  if (archToType == null) {
    throw new Error(`no ${platform.name} targets requested`)
  }
  return archToType
}

function deepCopy(map: ReadonlyMap<Arch, ReadonlyArray<string>>): Map<Arch, Array<string>> {
  return new Map(Array.from(map, ([arch, list]) => [arch, list.slice()] as const))
}

describe("computeArchToTargetNamesMap", () => {
  test("--win --x64 with nsis on x64 and ia32 builds nsis for both, again on a second call, and leaves the requested targets as they were", () => {
    const requested = requestedArchs(Platform.WINDOWS, { win: [], x64: true })
    const original = deepCopy(requested)
    const expected = new Map([
      [Arch.x64, ["nsis"]],
      [Arch.ia32, ["nsis"]],
    ])

    expect(computeArchToTargetNamesMap(requested, nsisOnBothArchs, Platform.WINDOWS)).toEqual(expected)
    expect(computeArchToTargetNamesMap(requested, nsisOnBothArchs, Platform.WINDOWS)).toEqual(expected)
    expect(requested).toEqual(original)
  })

  test("archs that share one requested list (--win --x64 --ia32) each get only their own configured targets", () => {
    const requested = requestedArchs(Platform.WINDOWS, { win: [], x64: true, ia32: true })
    // the CLI puts one array under every arch
    expect(requested.get(Arch.x64)).toBe(requested.get(Arch.ia32))

    expect(computeArchToTargetNamesMap(requested, { platformOptions: perArchTargets, defaultTarget: ["nsis"] }, Platform.WINDOWS)).toEqual(
      new Map([
        [Arch.x64, ["nsis"]],
        [Arch.ia32, ["portable"]],
      ])
    )
    expect(requested).toEqual(
      new Map([
        [Arch.x64, []],
        [Arch.ia32, []],
      ])
    )
  })

  test("an arch that shares its list but no configured target covers stays empty, so it builds the default targets", () => {
    const requested = Platform.WINDOWS.createTarget([], Arch.x64, Arch.ia32).get(Platform.WINDOWS)
    if (requested == null) {
      throw new Error("no windows targets requested")
    }
    expect(computeArchToTargetNamesMap(requested, { platformOptions: { target: "portable:x64" }, defaultTarget: ["nsis"] }, Platform.WINDOWS)).toEqual(
      new Map([
        [Arch.x64, ["portable"]],
        [Arch.ia32, []],
      ])
    )
  })

  test("requested targets win over the target option, as new arrays", () => {
    const requested = requestedArchs(Platform.WINDOWS, { win: ["zip", "dir:ia32"], x64: true })
    const result = computeArchToTargetNamesMap(requested, nsisOnBothArchs, Platform.WINDOWS)
    expect(result).toEqual(
      new Map([
        [Arch.x64, ["zip"]],
        [Arch.ia32, [DIR_TARGET]],
      ])
    )
    for (const [arch, list] of result) {
      expect(list).not.toBe(requested.get(arch))
    }
  })

  test("frozen requested lists, target option and default targets do not throw", () => {
    const empty = Object.freeze<Array<string>>([])
    const requested: ReadonlyMap<Arch, ReadonlyArray<string>> = new Map([
      [Arch.x64, empty],
      [Arch.ia32, empty],
    ])
    const archs: Array<ArchType> = ["x64"]
    const target = [{ target: "nsis", arch: archs }]
    const source: TargetNamesSource = { platformOptions: { target }, defaultTarget: ["portable"] }
    for (const it of [archs, ...target, target, source.platformOptions, source.defaultTarget, source]) {
      Object.freeze(it)
    }

    expect(computeArchToTargetNamesMap(requested, source, Platform.WINDOWS)).toEqual(
      new Map([
        [Arch.x64, ["nsis"]],
        [Arch.ia32, []],
      ])
    )
    expect(computeArchToTargetNamesMap(new Map(), { platformOptions: {}, defaultTarget: source.defaultTarget }, Platform.WINDOWS, { platform: "win32", arch: "x64" })).toEqual(
      new Map([[Arch.x64, ["portable"]]])
    )
  })

  test("with nothing requested and no target option, the default targets are built for the host's arch", () => {
    const source: TargetNamesSource = { platformOptions: {}, defaultTarget: ["AppImage", "snap"] }
    expect(computeArchToTargetNamesMap(new Map(), source, Platform.LINUX, { platform: "linux", arch: "arm64" })).toEqual(new Map([[Arch.arm64, ["AppImage", "snap"]]]))
    expect(computeArchToTargetNamesMap(new Map(), source, Platform.WINDOWS, { platform: "linux", arch: "ia32" })).toEqual(new Map([[Arch.ia32, ["AppImage", "snap"]]]))
    // a Linux build on a macOS or Windows host builds x64 only, whatever the host's arch
    for (const platform of ["darwin", "win32"] as const) {
      expect(computeArchToTargetNamesMap(new Map(), source, Platform.LINUX, { platform, arch: "arm64" })).toEqual(new Map([[Arch.x64, ["AppImage", "snap"]]]))
    }
  })

  test("a configured target without archs builds for the host's arch when none is requested", () => {
    const host: BuildHost = { platform: "darwin", arch: "arm64" }
    expect(computeArchToTargetNamesMap(new Map(), { platformOptions: { target: ["dmg", "zip:x64"] }, defaultTarget: [] }, Platform.MAC, host)).toEqual(
      new Map([
        [Arch.arm64, ["dmg"]],
        [Arch.x64, ["zip"]],
      ])
    )
  })

  test("the default targets of each arch are new arrays, not the packager's", () => {
    const defaultTarget = ["nsis"]
    const requested = new Map<Arch, Array<string>>()
    const linux = computeArchToTargetNamesMap(requested, { platformOptions: {}, defaultTarget }, Platform.LINUX, { platform: "darwin", arch: "arm64" })
    const windows = computeArchToTargetNamesMap(requested, { platformOptions: {}, defaultTarget }, Platform.WINDOWS, { platform: "win32", arch: "x64" })
    for (const list of [...linux.values(), ...windows.values()]) {
      expect(list).toEqual(["nsis"])
      expect(list).not.toBe(defaultTarget)
    }
    expect(defaultTarget).toEqual(["nsis"])
    expect(requested.size).toBe(0)
  })
})

describe("resolveTargetNames", () => {
  test("names each arch's own targets when the requested archs share one list", () => {
    const targets = normalizeOptions({ win: [], x64: true, ia32: true }).targets
    if (targets == null) {
      throw new Error("no targets requested")
    }
    expect(resolveTargetNames(targets, { win: { target: [{ target: "nsis", arch: "x64" }] } })).toEqual(new Map([[Platform.WINDOWS, new Set(["nsis", DEFAULT_TARGET])]]))
  })
})
