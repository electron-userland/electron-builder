import { removePassword } from "builder-util"
import { describe, it } from "vitest"

const testValue = "secretValue"
const testQuoted = "secret with spaces"

const keys = ["--accessKey", "--secretKey", "-P", "-p", "-pass", "-String", "/p", "pass:"]

keys.forEach(key => {
  describe(`removePassword: ${key}`, () => {
    it("handles unquoted value (snapshot)", ({ expect }) => {
      const input = `${key} ${testValue}`
      const output = removePassword(input)

      expect(output).toMatchSnapshot()
    })

    it("handles double-quoted value (snapshot)", ({ expect }) => {
      const input = `${key} "${testQuoted}"`
      const output = removePassword(input)

      expect(output).toMatchSnapshot()
    })

    it("handles single-quoted value (snapshot)", ({ expect }) => {
      const input = `${key} '${testQuoted}'`
      const output = removePassword(input)

      expect(output).toMatchSnapshot()
    })

    if (key === "/p") {
      it("handles Mac host path without hashing (snapshot)", ({ expect }) => {
        const macPath = "\\\\Mac\\Host\\Users\\user"
        const input = `${key} ${macPath}`
        const output = removePassword(input)

        expect(output).toMatchSnapshot()
      })
    }
  })
})

describe("removePassword: /b … /c block", () => {
  it("handles /b … /c block (snapshot)", ({ expect }) => {
    const secret = "blockSecret"
    const input = `/b ${secret} /c`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })
})

describe("removePassword: multiple keys in one string", () => {
  it("handles two keys unquoted (snapshot)", ({ expect }) => {
    const input = `--accessKey key1 --secretKey key2`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })

  it("handles mixed quoted and unquoted keys (snapshot)", ({ expect }) => {
    const input = `-p 'quoted secret' -pass unquoted`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })

  it("handles several keys and /b … /c block (snapshot)", ({ expect }) => {
    const input = `pass: val1 --accessKey "val two" /b blockpass /c`
    const output = removePassword(input)

    expect(output).toMatchSnapshot()
  })
})
