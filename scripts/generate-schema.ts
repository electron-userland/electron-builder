import * as fs from "fs"
import * as path from "path"
import { TypeScript } from "typedoc"
import * as TJS from "typescript-json-schema"

const rootDir = path.resolve(__dirname, "../packages")

const compilerOptions: TJS.CompilerOptions = {
  target: TypeScript.ScriptTarget.ES2022 as any,
  module: TypeScript.ModuleKind.ES2022 as any,
  // outDir: "out",
  baseUrl: rootDir,
  esModuleInterop: false,
  forceConsistentCasingInFileNames: true,
  moduleResolution: TypeScript.ModuleResolutionKind.Node10 as any,
  skipLibCheck: true,
  // strict: true,
  // noUnusedLocals: true,
  noFallthroughCasesInSwitch: true,
  // noImplicitReturns: true,
  noEmit: true,

  inlineSources: true,
  sourceMap: true,

  allowSyntheticDefaultImports: true,
  experimentalDecorators: true,
  downlevelIteration: true,

  newLine: TypeScript.NewLineKind.LineFeed,

  noEmitOnError: true,
  typesRoots: [
    "../typings",
    "../../typings",
    //
    "../node_modules/@types",
    "app-builder-lib/typings",
    "node_modules/@types"
  ].map(it => path.resolve(rootDir, it)),
}

// schema generator args
const settings: TJS.PartialArgs = {
  required: true,
  // ref: false,
  // aliasRef: true,
  noExtraProps: true,
  typeOfKeyword: true,
  strictNullChecks: true,
  skipLibCheck: true,
    ignoreErrors: true,
}

const definitionFile = path.resolve(rootDir, "app-builder-lib/src/configuration.ts")
const program = TJS.getProgramFromFiles([definitionFile], compilerOptions, rootDir)
const generator = TJS.buildGenerator(program, settings)
const schema = TJS.generateSchema(program, "Configuration", settings, [], generator!)

const PlugDescriptor: any = schema!.definitions!.PlugDescriptor
PlugDescriptor.additionalProperties = {
  type: "object",
}

const OutgoingHttpHeaders: any = schema!.definitions!.OutgoingHttpHeaders
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

const SnapOptions: any = schema!.definitions!.SnapOptions
SnapOptions.properties.environment = {
  additionalProperties: { type: "string" },
  type: "object",
}

schema!.properties!["$schema"] = {
  description: "JSON Schema for this document.",
  type: ["null", "string"],
}

const schemaFile = path.join(__dirname, "../packages/app-builder-lib/scheme.json")
fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2))
