import { describe } from "vitest"
import { generateAppRunScript } from "app-builder-lib/src/targets/linux/appimage/appImageUtil"

// Pure unit tests for the AppRun launcher entrypoint. executableArgs are baked into the launcher
// (single-quoted) rather than the .desktop Exec key, consistent with the other Linux targets.

const baseConfig = {
  ExecutableName: "TestApp",
  DesktopFileName: "TestApp.desktop",
  ProductFilename: "TestApp",
  ProductName: "Test App",
  ResourceName: "appimagekit-TestApp",
} as const

describe("generateAppRunScript", () => {
  test("declares an empty EXECUTABLE_ARGS array when no args are configured", ({ expect }) => {
    const script = generateAppRunScript({ ...baseConfig })
    expect(script).toContain("EXECUTABLE_ARGS=()")
  })

  test("single-quotes configured executableArgs into the launcher", ({ expect }) => {
    const script = generateAppRunScript({ ...baseConfig, ExecutableArgs: ['--js-flags="--max-old-space-size=12288"', "--no-sandbox"] })
    expect(script).toContain(`EXECUTABLE_ARGS=('--js-flags="--max-old-space-size=12288"' '--no-sandbox')`)
  })

  test("execs the binary with EXECUTABLE_ARGS ahead of the forwarded launch args", ({ expect }) => {
    const script = generateAppRunScript({ ...baseConfig })
    expect(script).toContain('exec "$BIN" "${NO_SANDBOX[@]}" "${EXECUTABLE_ARGS[@]}" "${args[@]}"')
  })

  test("includes EXECUTABLE_ARGS when detecting an explicit --no-sandbox", ({ expect }) => {
    const script = generateAppRunScript({ ...baseConfig })
    expect(script).toContain('for arg in "${EXECUTABLE_ARGS[@]}" "${args[@]}" ;')
  })
})
