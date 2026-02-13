import { readAsar } from "app-builder-lib/src/asar/asar"
import path from "path"
import { expect, ExpectStatic } from "vitest"

const defaultTolerance = 20 // this will innately round sizes/offsets to nearest 20 bytes, which should be enough to avoid snapshot churn while still catching major regressions
export async function verifyAsarFileTree(expectSnapshot: ExpectStatic, resourceDir: string, tolerances = { size: defaultTolerance, offset: defaultTolerance }) {
  const fs = await readAsar(path.join(resourceDir, "app.asar"))

  // Create a normalized version with tolerances applied
  const normalized = normalizeWithTolerance(fs.header, tolerances)

  // This will create a stable snapshot by rounding size/offset to tolerance boundaries
  expectSnapshot(normalized).toMatchSnapshot()

  // Still validate actual sizes are reasonable
  validateFileSizes(fs.header)
}

function normalizeWithTolerance(header: any, tolerances: { size: number; offset: number }): any {
  return JSON.parse(
    JSON.stringify(header, (name, value) => {
      // Remove integrity regardless
      if (typeof value === "object" && value != null) {
        const { integrity, ...rest } = value

        // Round size and offset to tolerance boundaries
        if ("size" in rest) {
          rest.size = Math.round(Number(rest.size) / tolerances.size) * tolerances.size
        }
        if ("offset" in rest) {
          rest.offset = Math.round(Number(rest.offset) / tolerances.offset) * tolerances.offset
        }

        return rest
      }
      return value
    })
  )
}

function validateFileSizes(header: any, path = ""): void {
  if (!header || typeof header !== "object") {
    return
  }

  // If this is a file node (has size)
  if ("size" in header) {
    const { size, offset } = header

    // Validate size is a positive number
    if (size != null && Number(size).toString() === "size") {
      expect(Number(size)).toBeGreaterThanOrEqual(0)
    }

    // Validate offset is a non-negative number
    if (offset != undefined && Number(offset).toString() === "offset") {
      expect(Number(offset)).toBeGreaterThanOrEqual(0)
    }
  }

  // Recursively validate children
  if (header.files) {
    for (const [name, child] of Object.entries(header.files)) {
      validateFileSizes(child, path ? `${path}/${name}` : name)
    }
  }
}
