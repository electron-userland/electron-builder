// helpers/dynamic-import.cjs uses CJS require.resolve so it can follow pnpm
// symlinks — load it via createRequire so TypeScript does not statically
// include the out-of-rootDir file in the compilation.
import { createRequire } from "node:module"

type DynamicImportHelper = {
  dynamicImport(modulePath: string): Promise<any>
  dynamicImportMaybe(modulePath: string): Promise<any>
}

const _helper = createRequire(import.meta.url)("../../helpers/dynamic-import.cjs") as DynamicImportHelper

export function dynamicImport<T = any>(modulePath: string): Promise<T> {
  return _helper.dynamicImport(modulePath) as Promise<T>
}
