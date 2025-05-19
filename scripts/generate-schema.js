import * as fs from "fs"
import * as path from "path"
import * as TJS from "typescript-json-schema"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "../packages/app-builder-lib")
const tsconfig = path.resolve(rootDir, "tsconfig.json")

const program = TJS.programFromConfig(tsconfig)
const schema = TJS.generateSchema(program, "Configuration", {
    required: true,
    noExtraProps: true,
    strictNullChecks: true,
    skipLibCheck: true,
    typeOfKeyword: true, // non-standard JSON schema, but used to include `typeOf` keyword in the schema for validation of `function` types
  })


// const PlugDescriptor = schema.definitions.PlugDescriptor
// PlugDescriptor.additionalProperties.anyOf[0] = {
//   type: "object",
// }

const OutgoingHttpHeaders = schema.definitions.OutgoingHttpHeaders
OutgoingHttpHeaders.additionalProperties = {
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

// const SnapOptions = schema.definitions.SnapOptions
// SnapOptions.properties.environment.anyOf[0] = {
//   additionalProperties: { type: "string" },
//   type: "object",
// }

schema.properties["$schema"] = {
  description: "JSON Schema for this document.",
  type: ["null", "string"],
}

const schemaFile = path.join(rootDir, "scheme.json")
fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2))
