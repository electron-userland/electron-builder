import * as path from "path"
import * as fs from "fs"
import * as TJS from "typescript-json-schema"
import { TypeScript } from "typedoc"

// optionally pass argument to schema generator
const settings: TJS.PartialArgs = {
  required: true,
  noExtraProps: true,
  typeOfKeyword: true,
  strictNullChecks: true,
  skipLibCheck: true,
}

const rootDir = path.resolve(__dirname, "../packages")
// optionally pass ts compiler options
const compilerOptions: TJS.CompilerOptions = {
  // outDir: "out",
  baseUrl: rootDir,
  target: TypeScript.ScriptTarget.ES2022,
  module: TypeScript.ModuleKind.ES2022,
  esModuleInterop: false,
  forceConsistentCasingInFileNames: true,
  moduleResolution: TypeScript.ModuleResolutionKind.Node10,
  skipLibCheck: true,
  strict: true,
  noUnusedLocals: true,
  noFallthroughCasesInSwitch: true,
  noImplicitReturns: true,

  inlineSources: true,
  sourceMap: true,

  allowSyntheticDefaultImports: true,
  experimentalDecorators: true,
  downlevelIteration: true,

  newLine: TypeScript.NewLineKind.LineFeed,

  noEmitOnError: true,
  // typeRoots: ["./packages/app-builder-lib/typings", "./node_modules/@types/"],
  types: [
    "../../typings",
    // "../typings",
    // "./src/typings",
    // "./app-builder-lib/src/typings",
    // "./packages/typings",
    // path.join(rootDir, "../typings"),
    // "typings/flatpak-bundler.d.ts"
    // "./packages/app-builder-lib/typings"
  ],
}

const program = TJS.getProgramFromFiles([path.resolve(rootDir, "app-builder-lib/src/configuration.ts")], compilerOptions, rootDir)
const generator = TJS.buildGenerator(program, settings)
const schema = TJS.generateSchema(program, "CommonConfiguration", settings, [], generator!)

const schemaFile = path.join(__dirname, "../packages/app-builder-lib/scheme.json")
fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2))
