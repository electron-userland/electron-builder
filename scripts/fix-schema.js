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

// checksums is not in the ElectronDownloadOptions TypeScript type; it belongs to ElectronGetOptions.
// Keep it in the schema for backward compatibility but enforce string values.
schema.definitions.ElectronDownloadOptions.properties.checksums = {
  type: "object",
  additionalProperties: { type: "string" },
}

// Fix Record<string,string>: additionalProperties:false rejects every non-empty object.
schema.definitions["Record<string,string>"] = {
  type: "object",
  additionalProperties: { type: "string" },
}

// Fix ElectronGetOptions: add type:object, add mirrorOptions, remove internal isGeneric field.
schema.definitions.ElectronGetOptions.type = "object"
delete schema.definitions.ElectronGetOptions.properties.isGeneric
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

o = schema.definitions.SnapOptions.properties.environment.anyOf[0] = {
  additionalProperties: { type: "string" },
  type: "object",
}

o = schema.properties["$schema"] = {
  description: "JSON Schema for this document.",
  type: ["null", "string"],
}

fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2))
