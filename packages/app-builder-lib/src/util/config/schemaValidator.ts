import Ajv, { ErrorObject } from "ajv"
import type { CodeKeywordDefinition } from "ajv"

const getTypeofDef: () => CodeKeywordDefinition = require("ajv-keywords/dist/definitions/typeof")

export type PostFormatter = (formattedError: string, error: ErrorObject) => string

export interface ValidationConfig {
  name?: string
  postFormatter?: PostFormatter
}

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  coerceTypes: true,
  strict: false,
})

ajv.addKeyword(getTypeofDef())

export function validateSchema(schema: unknown, data: unknown, config: ValidationConfig = {}): void {
  const validate = ajv.compile(schema as object)
  if (validate(data)) {
    return
  }

  const errors = validate.errors ?? []
  const baseDataPath = "configuration"
  const name = config.name ?? "Object"

  const relevant = filterRelevantErrors(errors)
  const formatted = relevant.map(error => {
    let msg = formatError(error, baseDataPath)
    if (config.postFormatter != null) {
      msg = config.postFormatter(msg, error)
    }
    return ` - ${indentNewlines(msg, "   ")}`
  })

  const header = `Invalid configuration object. ${name} has been initialized using a configuration object that does not match the API schema.`
  throw new Error(`${header}\n${formatted.join("\n")}`)
}

function filterRelevantErrors(errors: ErrorObject[]): ErrorObject[] {
  const compositeKeywords = new Set(["anyOf", "oneOf", "if"])
  const hasSpecific = errors.some(e => !compositeKeywords.has(e.keyword))
  return hasSpecific ? errors.filter(e => !compositeKeywords.has(e.keyword)) : errors
}

function instancePathToLabel(instancePath: string, baseDataPath: string): string {
  if (!instancePath) {
    return baseDataPath
  }
  const segments = instancePath.split("/").filter(Boolean)
  return [baseDataPath, ...segments].join(".")
}

function formatError(error: ErrorObject, baseDataPath: string): string {
  const label = instancePathToLabel(error.instancePath, baseDataPath)
  const params = error.params as Record<string, unknown>
  const parentSchema = (error as ErrorObject & { parentSchema?: Record<string, unknown> }).parentSchema

  switch (error.keyword) {
    case "additionalProperties":
      return `${label} has an unknown property '${params.additionalProperty}'`

    case "required": {
      const missingProp = String(params.missingProperty).replace(/^\./, "")
      return `${label} misses the property '${missingProp}'`
    }

    case "type": {
      const type = params.type
      if (Array.isArray(type)) {
        const typeList = (type as string[]).join(" | ")
        const desc = descriptionSuffix(parentSchema)
        return `${label} should be:\n${typeList}${desc}`
      }
      return `${label} should be a ${type}`
    }

    case "enum": {
      const enumVals = (parentSchema?.enum as unknown[] | undefined) ?? []
      if (enumVals.length === 1) {
        return `${label} should be ${JSON.stringify(enumVals[0])}`
      }
      return `${label} should be one of these:\n${enumVals.map(v => JSON.stringify(v)).join(" | ")}`
    }

    case "anyOf":
    case "oneOf": {
      const schemaText = formatSchemaType(parentSchema)
      return `${label} should be one of these:\n${schemaText}`
    }

    case "typeof":
      return `${label} should be a function`

    default:
      return `${label} ${error.message}`
  }
}

function descriptionSuffix(schema: Record<string, unknown> | undefined): string {
  return typeof schema?.description === "string" ? `\n-> ${schema.description}` : ""
}

function formatSchemaType(schema: Record<string, unknown> | undefined): string {
  if (schema == null) {
    return ""
  }
  if (Array.isArray(schema.type)) {
    return (schema.type as string[]).join(" | ")
  }
  if (typeof schema.type === "string") {
    return schema.type
  }
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as Array<Record<string, unknown>>)
      .map(s => {
        if (Array.isArray(s.type)) {
          return (s.type as string[]).join(" | ")
        }
        return typeof s.type === "string" ? s.type : ""
      })
      .filter(Boolean)
      .join(" | ")
  }
  return JSON.stringify(schema)
}

function indentNewlines(str: string, prefix: string): string {
  return str.replace(/\n(?!$)/g, `\n${prefix}`)
}
