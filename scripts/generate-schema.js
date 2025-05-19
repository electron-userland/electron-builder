const fs = require("fs")
const path = require("path")

const TJS = require("typescript-json-schema")

// Path to your tsconfig file
const basePath = path.join(__dirname, "../packages/app-builder-lib")
const schemaFile = path.join(basePath, "scheme.json")
const configPath = path.join(basePath, "tsconfig-scheme.json")

// Load TypeScript configuration
const settings = {
  required: true,
  noExtraProps: true,
  useTypeOfKeyword: true,
  strictNullChecks: true,
}

// Create the program from the file patterns and compiler options
const program = TJS.programFromConfig(configPath)

// Generate the schema for all types (or specify a particular type)
const schema = TJS.generateSchema(program, "Configuration", settings)

// Fix the schema to remove absolute paths
function cleanRefs(obj) {
  if (typeof obj !== "object" || obj === null) {
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      cleanRefs(item)
    }
    return
  }

  for (const key in obj) {
    const value = obj[key]

    // Fix keys in $defs or definitions
    if (key === "$defs" || key === "definitions") {
      for (const defKey in value) {
        if (/^import\(.*\)\.(\w+)$/.test(defKey)) {
          const match = defKey.match(/^import\(.*\)\.(\w+)$/)
          const newKey = match[1]
          value[newKey] = value[defKey]
          delete value[defKey]
        }
      }
    }

    cleanRefs(value)
  }
}

cleanRefs(schema)

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

o = schema.definitions.SnapOptions.properties.environment.anyOf[0] = {
  additionalProperties: { type: "string" },
  type: "object",
}

o = schema.properties["$schema"] = {
  description: "JSON Schema for this document.",
  type: ["null", "string"],
}

fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2))
