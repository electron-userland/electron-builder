import { executeAndDetach } from "dmg-builder"
import { vi } from "vitest"

test("detaches an image when its volume path cannot be parsed", async ({ expect }) => {
  const task = vi.fn()
  const detacher = vi.fn().mockResolvedValue(undefined)

  await expect(executeAndDetach("/dev/disk9\tApple_APFS", "/dev/disk9", true, task, detacher)).rejects.toThrow("Cannot find volume mount path for device: /dev/disk9")
  expect(task).not.toHaveBeenCalled()
  expect(detacher).toHaveBeenCalledOnce()
  expect(detacher).toHaveBeenCalledWith("/dev/disk9", true)
})

// hdiutil attach pads the device and content-hint columns with spaces before each tab
const row = (device: string, hint: string, mountPoint = "") => `${device.padEnd(20)}\t${hint.padEnd(31)}\t${mountPoint}`

// the volume path executeAndDetach hands its task, or null when it finds none
function volumePathOf(attachResult: string): Promise<string | null> {
  return executeAndDetach(
    attachResult,
    "/dev/disk9",
    false,
    async (volumePath: string) => volumePath,
    async () => undefined
  ).catch((e: Error) => {
    if (e.message.startsWith("Cannot find volume mount path")) {
      return null
    }
    throw e
  })
}

// the pattern executeAndDetach used before, which backtracked polynomially (CodeQL js/polynomial-redos);
// a whitespace-only volume name, for which it returned the bare "/Volumes/", is not a mount point
const OLD_PATTERN = /\s+(\/Volumes\/.+?)\s*$/
function oldVolumePath(attachResult: string): string | null {
  for (const line of attachResult.split("\n")) {
    const volumePath = OLD_PATTERN.exec(line)?.[1].trim()
    if (volumePath != null && volumePath !== "/Volumes/") {
      return volumePath
    }
  }
  return null
}

describe("volume path in hdiutil attach output", () => {
  test("takes the mount point of an HFS+ image, keeping spaces in the volume name", async ({ expect }) => {
    const output = [row("/dev/disk4", "GUID_partition_scheme"), row("/dev/disk4s1", "Apple_HFS", "/Volumes/My App 1.0")].join("\n") + "\n"
    expect(await volumePathOf(output)).toBe("/Volumes/My App 1.0")
  })

  test("takes the mount point of the synthesized APFS disk", async ({ expect }) => {
    const output = [
      row("/dev/disk4", "GUID_partition_scheme"),
      row("/dev/disk4s1", "Apple_APFS"),
      row("/dev/disk5", "EF57347C-0000-11AA-AA11-0030654"),
      row("/dev/disk5s1", "41504653-0000-11AA-AA11-0030654", "/Volumes/App 1.1.0"),
    ].join("\n")
    expect(await volumePathOf(output)).toBe("/Volumes/App 1.1.0")
  })

  test("skips license text and strips trailing whitespace and CR", async ({ expect }) => {
    const output = ["Software License Agreement", "Agree Y/N?", row("/dev/disk4s1", "Apple_HFS", "/Volumes/Licensed \t")].join("\r\n") + "\r\n"
    expect(await volumePathOf(output)).toBe("/Volumes/Licensed")
  })

  test("skips a mount point with an empty volume name", async ({ expect }) => {
    const output = [row("/dev/disk4s1", "Apple_HFS", "/Volumes/ "), row("/dev/disk5s1", "Apple_HFS", "/Volumes/Real")].join("\n")
    expect(await volumePathOf(output)).toBe("/Volumes/Real")
  })

  test("agrees with the previous pattern, except that an empty volume name is skipped", async ({ expect }) => {
    const alphabet = ["/Volumes", "/", " ", "\t", "\n", "a"]
    // every output of up to 6 tokens over the alphabet (55,986 strings)
    let outputs = [""]
    for (let length = 1; length <= 6; length++) {
      outputs = outputs.flatMap(output => alphabet.map(it => output + it))
      for (const output of outputs) {
        expect(await volumePathOf(output), JSON.stringify(output)).toBe(oldVolumePath(output))
      }
    }
  })

  test("runs in linear time on long runs of whitespace", async ({ expect }) => {
    // the inputs that made the previous pattern backtrack polynomially: ~6s each at 100k
    const spaces = " ".repeat(100_000)
    const start = process.hrtime.bigint()
    expect(await volumePathOf(`a${spaces}x`)).toBeNull()
    expect(await volumePathOf(row("/dev/disk4s1", "Apple_HFS", `/Volumes/a${spaces}x`))).toBe(`/Volumes/a${spaces}x`)
    expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(500)
  })
})
