import { describe, test, expect } from "vitest"
import { Arch } from "builder-util"
import { snapArchStringToArch } from "app-builder-lib/src/targets/linux/snap/snapcraftBuilder"

describe("snapArchStringToArch", () => {
  test.each([
    ["amd64", Arch.x64],
    ["arm64", Arch.arm64],
    ["armhf", Arch.armv7l],
    ["i386", Arch.ia32],
    ["i686", Arch.ia32],
  ])("%s → Arch.%s", (snapArch, expected) => {
    expect(snapArchStringToArch(snapArch)).toBe(expected)
  })

  test("unknown arch defaults to x64", () => {
    expect(snapArchStringToArch("riscv64")).toBe(Arch.x64)
  })
})
