import { expect } from "vitest"

// The chainable wrapper in test/vitest-scripts/vitest-config/vitest-setup.ts (installed as the global
// `test` / `it` / `describe` for every test file) must reject the legacy (name, fn, timeout) signature
// loudly. Before this guard, the trailing timeout was popped off as the "body" and vitest silently
// registered the test as todo — it never ran and nothing failed (found on PR #9764).
//
// The guard throws synchronously before any vitest registration is attempted, so it is safe to invoke
// the wrapper with an invalid signature inside a running test body and assert on the thrown error.
describe("vitest-setup chainable wrapper legacy-signature guard", () => {
  test("test(name, fn, timeout) throws instead of silently registering a todo test", () => {
    expect(() => (test as any)("legacy signature", () => undefined, 5000)).toThrow(/legacy \(name, fn, timeout\) signature is not supported/)
  })

  test("test(name) without a body throws", () => {
    expect(() => (test as any)("no body at all")).toThrow(/registered without a function body/)
  })

  test("test(name, options, trailingNumber) throws when the last argument is not a function", () => {
    expect(() => (test as any)("options then timeout", { timeout: 5000 }, 1234)).toThrow(/registered without a function body/)
  })

  test("describe(name, fn, timeout) throws as well", () => {
    expect(() => (describe as any)("legacy suite", () => undefined, 5000)).toThrow(/legacy \(name, fn, timeout\) signature is not supported/)
  })

  test("chained variants keep the guard (test.heavy)", () => {
    expect(() => (test.heavy as any)("legacy heavy", () => undefined, 5000)).toThrow(/legacy \(name, fn, timeout\) signature is not supported/)
  })

  test("the thrown error names the offending test", () => {
    expect(() => (test as any)("my offending test", () => undefined, 5000)).toThrow(/"my offending test"/)
  })
})
