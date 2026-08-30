import { Ajv, ErrorObject, ValidateFunction } from "ajv"

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

// Cache the compiled validator for the canonical scheme.json so it is only
// compiled once per process lifetime.
let _cachedValidate: ValidateFunction | undefined

export function validateSchema(schema: unknown, data: unknown, config: ValidationConfig = {}): void {
  if (_cachedValidate == null || _cachedValidate.schema !== schema) {
    _cachedValidate = ajv.compile(schema as object)
  }
  const validate = _cachedValidate

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
  const guidance = [
    `Please check the documentation to ensure that your configuration matches the expected schema: https://www.electron.build/configuration`,
    `If you recently upgraded electron-builder to v27, please run \`electron-builder migrate-schema\` to automatically update your configuration.`,
    `Check the release notes for breaking changes: https://www.electron.build/docs/migration/v27-breaking-changes`,
  ]
  throw new Error(`${header}\n${formatted.join("\n")}\n${guidance.join("\n")}`)
}

/**
 * Filters the flat list of ajv errors to the most actionable subset.
 * Composite keywords (anyOf/oneOf/if) are suppressed when more specific
 * errors exist at the same or deeper paths.  When all errors share the
 * same instancePath and a composite parent for that path exists, the
 * parent is kept instead so the user sees a single "should be one of"
 * message rather than every failed branch listed separately.
 */
function filterRelevantErrors(errors: ErrorObject[]): ErrorObject[] {
  const compositeKeywords = new Set(["anyOf", "oneOf", "if"])
  const specific = errors.filter(e => !compositeKeywords.has(e.keyword))

  if (specific.length === 0) {
    return errors.filter(e => compositeKeywords.has(e.keyword))
  }

  // Group specific errors by instancePath
  const byPath = new Map<string, ErrorObject[]>()
  for (const e of specific) {
    const list = byPath.get(e.instancePath)
    if (list != null) {
      list.push(e)
    } else {
      byPath.set(e.instancePath, [e])
    }
  }

  const result: ErrorObject[] = []
  for (const [path, group] of byPath) {
    if (group.length > 1) {
      // additionalProperties errors are the most actionable ("has unknown
      // property X") — prefer them over anyOf-parent collapse or type noise.
      const additionalProps = group.filter(e => e.keyword === "additionalProperties")
      if (additionalProps.length > 0) {
        result.push(...additionalProps)
        continue
      }
      // For other multi-error groups, prefer the anyOf parent (one concise
      // "should be one of these" message).
      const parent = errors.find(e => e.instancePath === path && compositeKeywords.has(e.keyword))
      if (parent != null) {
        result.push(parent)
        continue
      }
    }
    result.push(...group)
  }
  return result
}

/** Decodes a single RFC 6901 JSON Pointer segment (`~1` → `/`, `~0` → `~`). */
function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~")
}

function instancePathToLabel(instancePath: string, baseDataPath: string): string {
  if (!instancePath) {
    return baseDataPath
  }
  const segments = instancePath.split("/").filter(Boolean).map(decodePointerSegment)
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
