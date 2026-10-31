import { errorToString } from "builder-util-runtime"

describe("errorToString", () => {
  test("prefers the stack trace of an error", ({ expect }) => {
    const error = new Error("boom")
    expect(errorToString(error)).toBe(error.stack)
  })

  test("falls back to the message when the stack is empty", ({ expect }) => {
    const error = new Error("boom")
    error.stack = ""
    expect(errorToString(error)).toBe("boom")
  })

  test("uses the message of an error-like object without a stack", ({ expect }) => {
    expect(errorToString({ message: "boom" })).toBe("boom")
  })

  test("stringifies values that are not error-like", ({ expect }) => {
    expect(errorToString("boom")).toBe("boom")
    expect(errorToString(42)).toBe("42")
    expect(errorToString(null)).toBe("null")
    expect(errorToString(undefined)).toBe("undefined")
    expect(errorToString({ message: "" })).toBe("[object Object]")
  })

  test("does not throw for a value that cannot be converted to a string", ({ expect }) => {
    expect(errorToString(Object.create(null))).toBe("[unprintable error]")
  })

  test("does not throw when reading the stack throws", ({ expect }) => {
    const throwingStack = {
      get stack(): string {
        throw new Error("getter")
      },
    }
    expect(errorToString(throwingStack)).toBe("[unprintable error]")
  })
})
