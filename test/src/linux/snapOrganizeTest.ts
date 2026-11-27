import { computeAppPartOrganize } from "app-builder-lib/src/targets/linux/snap/core24"

// The core24 `organize` of the app part, computed from the top-level entries of the app directory. The entry names are arbitrary:
// the mapping depends only on the names, never on which files an Electron distribution holds.
describe("computeAppPartOrganize", () => {
  test("moves every entry under app/, in sorted order", ({ expect }) => {
    const organize = computeAppPartOrganize(["gamma", "alpha", "lib-beta.so", "delta"], undefined, [])
    expect(organize).toEqual({ alpha: "app/alpha", delta: "app/delta", gamma: "app/gamma", "lib-beta.so": "app/lib-beta.so" })
    expect(Object.keys(organize)).toEqual(["alpha", "delta", "gamma", "lib-beta.so"])
  })

  test("does not sort the entries it is given in place", ({ expect }) => {
    const entries = ["beta", "alpha"]
    computeAppPartOrganize(entries, undefined, [])
    expect(entries).toEqual(["beta", "alpha"])
  })

  test("leaves the excluded entries out", ({ expect }) => {
    expect(computeAppPartOrganize(["alpha", "launcher", "beta", "helper"], null, ["launcher", "helper"])).toEqual({ alpha: "app/alpha", beta: "app/beta" })
  })

  test("skips empty entry names", ({ expect }) => {
    expect(computeAppPartOrganize(["", "alpha"], undefined, [])).toEqual({ alpha: "app/alpha" })
  })

  test("keeps the configured mapping of an entry and adds the others", ({ expect }) => {
    const configured = { alpha: "custom/alpha", "not-in-dir": "elsewhere/not-in-dir" }
    const organize = computeAppPartOrganize(["alpha", "beta"], configured, [])
    expect(organize).toEqual({ alpha: "custom/alpha", "not-in-dir": "elsewhere/not-in-dir", beta: "app/beta" })
    // the configured mapping is copied, not changed
    expect(configured).toEqual({ alpha: "custom/alpha", "not-in-dir": "elsewhere/not-in-dir" })
  })

  test("maps entries named like Object.prototype members", ({ expect }) => {
    const organize = computeAppPartOrganize(["__proto__", "constructor", "toString"], undefined, [])
    expect(Object.getPrototypeOf(organize)).toBeNull()
    expect(Object.entries(organize)).toEqual([
      ["__proto__", "app/__proto__"],
      ["constructor", "app/constructor"],
      ["toString", "app/toString"],
    ])
  })
})
