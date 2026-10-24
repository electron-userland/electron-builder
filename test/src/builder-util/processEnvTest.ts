import { exec } from "builder-util"
import { execFile } from "child_process"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// Nothing is started: execFile records the environment that a child process would get
vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>()
  return {
    ...actual,
    execFile: vi.fn((_file: string, _args: unknown, _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, "", "")
      return {} as any
    }),
  }
})

const originalPlatform = process.platform
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

// process.env keeps the casing a variable was first set with, which on Windows can be SYSTEMROOT rather than SystemRoot
function valueOf(env: NodeJS.ProcessEnv | undefined, name: string): string | undefined {
  return Object.entries(env ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
}

async function childEnv(options?: { env?: NodeJS.ProcessEnv }): Promise<NodeJS.ProcessEnv | undefined> {
  await exec("tool", [], options)
  const call = vi.mocked(execFile).mock.calls.at(-1) as unknown as [string, string[], { env?: NodeJS.ProcessEnv }]
  return call[2].env
}

beforeEach(() => {
  vi.mocked(execFile).mockClear()
  vi.stubEnv("CSC_KEY_PASSWORD", "signing-password")
  vi.stubEnv("GH_TOKEN", "github-token")
  vi.stubEnv("AZURE_CLIENT_SECRET", "azure-secret")
  vi.stubEnv("SystemRoot", "C:\\Windows")
  vi.stubEnv("TEMP", "C:\\Temp")
  vi.stubEnv("LC_ALL", undefined)
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.unstubAllEnvs()
})

describe.each(["win32", "linux", "darwin"] as const)("the environment of a child process on %s", platform => {
  test("has no credentials when the caller passes no environment, and keeps the rest", async ({ expect }) => {
    setPlatform(platform)
    const env = await childEnv()
    expect(env).toBeDefined()
    expect(env).not.toHaveProperty("CSC_KEY_PASSWORD")
    expect(env).not.toHaveProperty("GH_TOKEN")
    expect(env).not.toHaveProperty("AZURE_CLIENT_SECRET")
    expect(valueOf(env, "SystemRoot")).toBe("C:\\Windows")
    expect(valueOf(env, "TEMP")).toBe("C:\\Temp")
    expect(valueOf(env, "PATH")).toBe(process.env.PATH)
  })

  test("is the caller's environment when it passes one", async ({ expect }) => {
    setPlatform(platform)
    const env = await childEnv({ env: { AZURE_CLIENT_SECRET: "azure-secret", PATH: "/bin" } })
    expect(env?.AZURE_CLIENT_SECRET).toBe("azure-secret")
    expect(valueOf(env, "PATH")).toBe("/bin")
    expect(env).not.toHaveProperty("GH_TOKEN")
  })
})

test("sets the locale variables on POSIX only", async ({ expect }) => {
  setPlatform("win32")
  expect(await childEnv()).not.toHaveProperty("LC_ALL")
  setPlatform("darwin")
  expect((await childEnv())?.LC_ALL).toBe("en_US.UTF-8")
})
