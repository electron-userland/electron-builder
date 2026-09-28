const fs = require("fs")
const path = require("path")

const schemaFile = path.join(__dirname, "../packages/app-builder-lib/scheme.json")
const schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8"))

let o = schema.definitions.PlugDescriptor.additionalProperties.anyOf[0]
delete o.typeof
o.type = "object"

schema.definitions.OutgoingHttpHeaders.additionalProperties = {
  anyOf: [
    {
      items: {
        type: "string",
      },
      type: "array",
    },
    {
      type: ["string", "number"],
    },
  ],
}

// Fix Record<string,string>: additionalProperties:false rejects every non-empty object.
schema.definitions["Record<string,string>"] = {
  type: "object",
  additionalProperties: { type: "string" },
}

// Fix Record<string,X> types: additionalProperties:false rejects every non-empty object.
for (const key of ["Record<string,App>", "Record<string,Component>", "Record<string,Hook>", "Record<string,Part>", "Record<string,Platform>", "Record<string,unknown>"]) {
  schema.definitions[key] = { type: "object", additionalProperties: {} }
}
schema.definitions["Record<string,Record<string,string>>"] = {
  type: "object",
  additionalProperties: { type: "object", additionalProperties: { type: "string" } },
}
schema.definitions["Record<string,string|null>"] = {
  type: "object",
  additionalProperties: { type: ["string", "null"] },
}

// Fix ElectronGetOptions: add type:object, add mirrorOptions, remove internal isGeneric field.
schema.definitions.ElectronGetOptions.type = "object"
schema.definitions.ElectronGetOptions.properties.mirrorOptions = {
  type: "object",
  additionalProperties: false,
  description: "Mirror options passed directly to @electron/get. Omits customDir, customFilename, and customVersion which are controlled by electron-builder.",
  properties: {
    mirror: { type: "string", description: "The base mirror URL for downloading Electron artifacts." },
    nightlyMirror: { type: "string", description: "The mirror URL to use for nightly Electron builds." },
    resolveAssetURL: { type: "string", description: "A custom function (serialised) to resolve the full asset URL." },
  },
}

const record = {
  additionalProperties: { type: "string" },
  type: "object",
}
o = schema.definitions.SnapOptions24.properties.environment.anyOf[0] = record
o = schema.definitions.SnapOptionsLegacy.properties.environment.anyOf[0] = record

// Fix `updateManifest`: ajv runs with `coerceTypes: true`, which coerces on the `type` keyword and MUTATES the
// data on the first matching `anyOf` branch. With a `{ const: false, type: "boolean" }` branch, `null` coerces
// into `false` - silently turning `updateManifest: null` ("signing still required, resolve the key from the
// environment") into the `updateManifest: false` opt-out that ships unsigned manifests. Reordering does not help:
// putting the `{ type: "null" }` branch first coerces `false` into `null` instead. Dropping `type` from the
// literal branch removes coercion in both directions - `const: false` then matches only a real `false`, and
// `null` falls through to the null branch untouched.
// Only `updateManifest` is touched: elsewhere (e.g. `win.sign`) `null` and `false` mean the same thing, so the
// coercion is harmless there and changing it could alter behaviour that has not been checked.
function untypeFalseBranch(host) {
  const property = host == null ? null : host.updateManifest
  if (property == null || !Array.isArray(property.anyOf)) {
    return false
  }
  const literal = property.anyOf.find(branch => branch.const === false)
  if (literal == null || literal.type === undefined) {
    return false
  }
  delete literal.type
  return true
}

const patchedUpdateManifest = [schema.properties, ...Object.values(schema.definitions).map(it => it.properties)].filter(untypeFalseBranch).length
if (patchedUpdateManifest === 0) {
  throw new Error("fix-schema: no `updateManifest` false-branch was patched - did the option or its union change?")
}

o = schema.properties["$schema"] = {
  description: "JSON Schema for this document.",
  type: ["null", "string"],
}

fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2))
