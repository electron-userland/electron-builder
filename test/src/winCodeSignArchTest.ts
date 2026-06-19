import { getWindowsKitsBundle } from "app-builder-lib/src/toolsets/winCodeSign"
import { clearCustomToolsetCache } from "app-builder-lib/src/toolsets/custom"
import type { ToolsetCustom } from "app-builder-lib/internal"
import * as path from "path"
import { afterEach, beforeEach } from "vitest"

// The Windows Kits tools (signtool/makeappx/makepri) are host executables. The kit is always the x64
// bundle (x86 on 32-bit hosts), never arm64: x64 runs on x64 hosts natively and on arm64 Windows via
// emulation, whereas an arm64 binary on an x64 host fails with "spawn UNKNOWN" (the 100%-reproducible
// CI failure this guards against).
const expectedKitArch = process.arch === "ia32" ? "x86" : "x64"

beforeEach(() => clearCustomToolsetCache())
afterEach(() => clearCustomToolsetCache())

describe("getWindowsKitsBundle kit arch", () => {
  test("selects the x64 kit subdir (x86 on 32-bit hosts), never arm64, regardless of target arch", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const toolset: ToolsetCustom = { url: `file://${dir}` }
    const { kit, appxAssets } = await getWindowsKitsBundle({ winCodeSign: toolset, resourcesDir: "" })
    // kit is always <bundle-root>/<host-runnable-arch>; appxAssets is the arch-independent bundle root.
    expect(path.basename(kit)).toBe(expectedKitArch)
    expect(path.basename(kit)).not.toBe("arm64")
    expect(kit).toBe(path.join(appxAssets, expectedKitArch))
  })
})
