import { parseXml } from "builder-util-runtime"
import { expect, test } from "vitest"

test("preserves adjacent text and CDATA segments", () => {
  const root = parseXml("<root>before<![CDATA[middle]]>after</root>")

  expect(root.value).toBe("beforemiddleafter")
  expect(root.isCData).toBe(true)
})

test("rejects an unclosed document", () => {
  expect(() => parseXml("<root>")).toThrow()
})

test("rejects a document without a root element", () => {
  expect(() => parseXml("")).toThrow("No root element")
})
