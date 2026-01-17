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

schema.definitions.ElectronDownloadOptions.properties.checksums = {
  type: "object",
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
