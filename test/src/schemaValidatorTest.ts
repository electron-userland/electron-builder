import { validateSchema } from "app-builder-lib/out/util/config/schemaValidator"
import { describe, expect, it } from "vitest"

const simpleSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    count: { type: "number" },
    enabled: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
    nested: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "string" },
      },
    },
    nullable: { type: ["null", "string"], description: "A nullable field" },
    callback: {
      anyOf: [{ typeof: "function" }, { type: ["null", "string"] }],
    },
  },
  required: ["name"],
}

describe("validateSchema - valid inputs", () => {
  it("accepts a fully valid object", () => {
    expect(() => validateSchema(simpleSchema, { name: "hello", count: 1, enabled: true })).not.toThrow()
  })

  it("accepts minimal object with only required fields", () => {
    expect(() => validateSchema(simpleSchema, { name: "test" })).not.toThrow()
  })

  it("accepts null for nullable field", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", nullable: null })).not.toThrow()
  })

  it("accepts string for nullable field", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", nullable: "value" })).not.toThrow()
  })

  it("accepts function for callback field", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", callback: () => {} })).not.toThrow()
  })

  it("accepts null for callback field", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", callback: null })).not.toThrow()
  })

  it("accepts string for callback field", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", callback: "path/to/module" })).not.toThrow()
  })
})

describe("validateSchema - additionalProperties errors", () => {
  it("reports unknown root property", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", unknown: 1 })).toThrow("configuration has an unknown property 'unknown'")
  })

  it("reports unknown nested property", () => {
    expect(() => validateSchema(simpleSchema, { name: "x", nested: { value: "a", extra: "b" } })).toThrow("configuration.nested has an unknown property 'extra'")
  })
})

describe("validateSchema - required errors", () => {
  it("reports missing required property", () => {
    expect(() => validateSchema(simpleSchema, {})).toThrow("configuration misses the property 'name'")
  })
})

describe("validateSchema - type errors", () => {
  it("reports wrong single type (array cannot coerce to string)", () => {
    expect(() => validateSchema(simpleSchema, { name: [] })).toThrow("configuration.name should be a string")
  })

  it("does not throw when coerceTypes converts a value (string to number)", () => {
    // "42" is coercible to a number, so count:"42" is valid
    expect(() => validateSchema(simpleSchema, { name: "x", count: "42" })).not.toThrow()
  })

  it("includes description for multi-type fields (object is not coercible)", () => {
    // Newlines in the formatted error are indented with 3 spaces by the validator
    expect(() => validateSchema(simpleSchema, { name: "x", nullable: {} })).toThrow("configuration.nullable should be:\n   null | string\n   -> A nullable field")
  })

  it("formats multi-type as pipe-separated list", () => {
    let msg = ""
    try {
      validateSchema(simpleSchema, { name: "x", nullable: {} })
    } catch (e: any) {
      msg = e.message
    }
    expect(msg).toContain("null | string")
  })
})

describe("validateSchema - enum errors", () => {
  const enumSchema = {
    type: "object",
    properties: {
      mode: { enum: ["a", "b", "c"] },
    },
    additionalProperties: false,
  }

  it("reports invalid enum value", () => {
    expect(() => validateSchema(enumSchema, { mode: "d" })).toThrow("configuration.mode should be one of these")
  })

  it("includes valid values in error", () => {
    let msg = ""
    try {
      validateSchema(enumSchema, { mode: "z" })
    } catch (e: any) {
      msg = e.message
    }
    expect(msg).toContain('"a"')
    expect(msg).toContain('"b"')
    expect(msg).toContain('"c"')
  })

  it("reports single enum value correctly", () => {
    const singleEnum = { type: "object", properties: { mode: { enum: ["only"] } }, additionalProperties: false }
    expect(() => validateSchema(singleEnum, { mode: "wrong" })).toThrow('configuration.mode should be "only"')
  })
})

describe("validateSchema - typeof errors", () => {
  const fnSchema = {
    type: "object",
    properties: {
      hook: { typeof: "function" },
    },
    additionalProperties: false,
  }

  it("rejects non-function for typeof:function", () => {
    expect(() => validateSchema(fnSchema, { hook: "string" })).toThrow("configuration.hook should be a function")
  })

  it("accepts function for typeof:function", () => {
    expect(() => validateSchema(fnSchema, { hook: () => {} })).not.toThrow()
  })
})

describe("validateSchema - postFormatter", () => {
  it("calls postFormatter with formatted error and raw error object", () => {
    const calls: Array<{ formatted: string; error: unknown }> = []
    try {
      validateSchema(
        simpleSchema,
        { name: "x", unknown: 1 },
        {
          postFormatter: (formatted, error) => {
            calls.push({ formatted, error })
            return `WRAPPED: ${formatted}`
          },
        }
      )
    } catch (e: any) {
      expect(e.message).toContain("WRAPPED:")
    }
    expect(calls).toHaveLength(1)
    expect(calls[0].formatted).toContain("has an unknown property 'unknown'")
    expect((calls[0].error as any).keyword).toBe("additionalProperties")
    expect((calls[0].error as any).instancePath).toBe("")
  })

  it("uses instancePath on error object passed to postFormatter", () => {
    let capturedPath = ""
    try {
      validateSchema(
        simpleSchema,
        { name: "x", nested: { value: "ok", extra: 1 } },
        {
          postFormatter: (msg, error) => {
            capturedPath = (error as any).instancePath
            return msg
          },
        }
      )
    } catch (_e) {
      // expected to throw
    }
    expect(capturedPath).toBe("/nested")
  })

  it("uses custom name in header", () => {
    // Use an array for name since coerceTypes won't coerce array to string
    expect(() => validateSchema(simpleSchema, { name: [] }, { name: "MyApp 1.0.0" })).toThrow("MyApp 1.0.0 has been initialized")
  })
})

describe("validateSchema - coercion", () => {
  it("coerces string 'false' to boolean false", () => {
    const boolSchema = {
      type: "object",
      properties: { flag: { type: "boolean" } },
      additionalProperties: false,
    }
    const data: any = { flag: "false" }
    validateSchema(boolSchema, data)
    expect(data.flag).toBe(false)
  })
})

describe("validateSchema - error header", () => {
  it("throws Error with correct header", () => {
    let err: Error | undefined
    try {
      validateSchema(simpleSchema, { name: [] }, { name: "test-app 2.0.0" })
    } catch (e: any) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toContain("Invalid configuration object. test-app 2.0.0 has been initialized using a configuration object that does not match the API schema.")
  })

  it("uses default name when not provided", () => {
    let err: Error | undefined
    try {
      validateSchema(simpleSchema, { name: [] })
    } catch (e: any) {
      err = e
    }
    expect(err!.message).toContain("Invalid configuration object. Object has been initialized")
  })
})

describe("validateSchema - nested instancePath formatting", () => {
  it("converts deep nested path to dot-notation label", () => {
    const deepSchema = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: {
              type: "object",
              additionalProperties: false,
              properties: { c: { type: "string" } },
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    }
    expect(() => validateSchema(deepSchema, { a: { b: { c: "ok", d: "extra" } } })).toThrow("configuration.a.b has an unknown property 'd'")
  })
})
