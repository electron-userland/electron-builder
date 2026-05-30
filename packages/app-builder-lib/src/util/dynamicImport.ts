// TypeScript's "module": "CommonJS" compiles `await import(x)` to
// `await Promise.resolve().then(() => require(x))`, which fails for ESM-only
// packages. helpers/dynamic-import.js is plain JS so TypeScript never
// transforms its native import() call — route through it instead.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _helper = require("../../helpers/dynamic-import") as { dynamicImport(path: string): Promise<any> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dynamicImport<T = any>(modulePath: string): Promise<T> {
  return _helper.dynamicImport(modulePath)
}
