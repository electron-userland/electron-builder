import * as path from "path"

const root = path.join(__dirname, "..", "..")

export function getTemplatePath(file: string) {
  return path.join(root, "templates", file)
}

export function getVendorPath(file?: string) {
  return file == null ? path.join(root, "vendor") : path.join(root, "vendor", file)
}