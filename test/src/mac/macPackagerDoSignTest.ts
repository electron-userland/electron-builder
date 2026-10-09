import { beforeEach, expect, vi } from "vitest"
import { MacPackager, type CustomMacSignOptions, type MacPackager as MacPackagerType } from "app-builder-lib"
import type { Identity } from "app-builder-lib/internal"
import { sign } from "app-builder-lib/src/codeSign/mac/macCodeSign.js"

// `doSign` hands `opts` straight to @electron/osx-sign. The bug behind #10237 lived at exactly this handoff: the
// identity was re-derived here (`sign({ ...opts, identity: identity.name })`), silently sending osx-sign a
// different form of the certificate than the one MacTargetHelper.resolveSignIdentity had picked — and than a
// custom signer received. These tests fail if anything ever re-derives it again.
vi.mock("app-builder-lib/src/codeSign/mac/macCodeSign.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/codeSign/mac/macCodeSign.js")>()
  return { ...actual, sign: vi.fn<typeof actual.sign>() }
})

const HASH = "0123456789ABCDEF0123456789ABCDEF01234567"
const identity = { name: "Developer ID Application: Foo (TEAM123)", hash: HASH } as Identity

function signOptions(): CustomMacSignOptions {
  return { app: "/out/My.app", identity: HASH, platform: "mas", type: "distribution" }
}

// `doSign` is protected, and the only `this` it touches is `appInfo.type` / `info.getWorkspaceRoot()`, and only on
// the custom-sign branch — so a hand-rolled `this` is enough (cf. CheckingMacPackager's `prototype.pack.call`).
function invokeDoSign(self: Partial<MacPackagerType>, opts: CustomMacSignOptions, signConfig: any): Promise<void> {
  return (MacPackager.prototype as any).doSign.call(self, opts, signConfig, identity)
}

describe("MacPackager.doSign", () => {
  beforeEach(() => {
    vi.mocked(sign).mockReset()
    vi.mocked(sign).mockResolvedValue(undefined)
  })

  test.for<[string, any]>([
    ["no sign config", undefined],
    ["an ElectronSignOptions object", { type: "distribution" }],
  ])("forwards opts to @electron/osx-sign verbatim with %s", async ([, signConfig]) => {
    const opts = signOptions()
    await invokeDoSign({}, opts, signConfig)
    expect(vi.mocked(sign)).toHaveBeenCalledTimes(1)
    // `toBe`, not `toEqual`: a re-derived `{ ...opts, identity: ... }` must fail even when the value happens to match
    expect(vi.mocked(sign).mock.calls[0][0]).toBe(opts)
    expect(vi.mocked(sign).mock.calls[0][0].identity).toBe(HASH)
  })

  test("a custom signer receives the same opts and osx-sign is not called", async () => {
    const opts = signOptions()
    const customSign = vi.fn<(o: CustomMacSignOptions, p: MacPackagerType) => Promise<void>>().mockResolvedValue(undefined)
    const self = { appInfo: { type: "module" }, info: { getWorkspaceRoot: () => Promise.resolve("/project") } } as unknown as MacPackagerType
    await invokeDoSign(self, opts, customSign)
    expect(customSign).toHaveBeenCalledTimes(1)
    expect(customSign.mock.calls[0][0]).toBe(opts)
    expect(customSign.mock.calls[0][0].identity).toBe(HASH)
    expect(customSign.mock.calls[0][1]).toBe(self)
    expect(vi.mocked(sign)).not.toHaveBeenCalled()
  })
})
