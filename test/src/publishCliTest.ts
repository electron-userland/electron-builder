import { PublishManager } from "app-builder-lib"
import { Arch } from "builder-util"
import * as fsp from "fs/promises"
import * as path from "path"
import { afterEach, describe, vi } from "vitest"
import { createUploadTasks, publishArtifactsWithOptions } from "../../packages/electron-builder/src/publish"

test("deduplicates publish tasks by file and architecture", ({ expect }) => {
  const tasks = createUploadTasks([
    { file: "/tmp/app.zip", arch: "x64" },
    { file: "/tmp/app.zip", arch: "x64" },
    { file: "/tmp/app.zip", arch: "arm64" },
  ])

  expect(tasks).toHaveLength(2)
  expect(tasks.map(task => task.arch)).toEqual([Arch.x64, Arch.arm64])
})

// publish -f loads the configuration once: the Packager used to merge the loaded configuration into the same file again, so a `publish`
// list failed validation (JSON, YAML) or contained itself (a JS config: "Converting circular structure to JSON")
describe("publish -f with a publish list in the configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const publish = [{ provider: "generic", url: "https://example.com/updates" }]
  for (const { title, file, content, configurationFilePath } of [
    { title: "electron-builder.json, found by default", file: "electron-builder.json", content: JSON.stringify({ publish }), configurationFilePath: undefined },
    {
      title: "electron-builder.cjs, found by default",
      file: "electron-builder.cjs",
      content: `module.exports = { publish: ${JSON.stringify(publish)} }`,
      configurationFilePath: undefined,
    },
    {
      title: "a JS config given with -c",
      file: "release.config.cjs",
      content: `module.exports = { publish: ${JSON.stringify(publish)} }`,
      configurationFilePath: "release.config.cjs",
    },
  ]) {
    test(title, async ({ expect, tmpDir }) => {
      const projectDir = await tmpDir.getTempDir({ prefix: "publish-cli" })
      await fsp.mkdir(projectDir, { recursive: true })
      await fsp.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "publish-test", version: "1.0.0", description: "test", author: "test" }))
      await fsp.writeFile(path.join(projectDir, file), content)
      const upload = path.join(projectDir, "notes.txt")
      await fsp.writeFile(upload, "release notes")
      vi.spyOn(process, "cwd").mockReturnValue(projectDir)
      const scheduleUpload = vi.spyOn(PublishManager.prototype, "scheduleUpload").mockResolvedValue(undefined)

      const result = await publishArtifactsWithOptions([{ file: upload, arch: null }], undefined, configurationFilePath)

      expect(result).toHaveLength(1)
      expect(scheduleUpload.mock.calls.map(([publishConfiguration]) => publishConfiguration)).toEqual([expect.objectContaining(publish[0])])
    })
  }
})

describe("publish -f configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function publishInProject(
    projectDir: string,
    files: Record<string, string>,
    configurationFilePath: string | undefined,
    publishConfiguration?: Parameters<typeof publishArtifactsWithOptions>[3]
  ) {
    await fsp.mkdir(projectDir, { recursive: true })
    await fsp.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "publish-test", version: "1.0.0", description: "test", author: "test" }))
    for (const [file, content] of Object.entries(files)) {
      await fsp.mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
      await fsp.writeFile(path.join(projectDir, file), content)
    }
    const upload = path.join(projectDir, "notes.txt")
    await fsp.writeFile(upload, "release notes")
    vi.spyOn(process, "cwd").mockReturnValue(projectDir)
    const scheduleUpload = vi.spyOn(PublishManager.prototype, "scheduleUpload").mockResolvedValue(undefined)
    await publishArtifactsWithOptions([{ file: upload, arch: null }], undefined, configurationFilePath, publishConfiguration)
    return scheduleUpload.mock.calls.map(([config]) => config)
  }

  // the Packager read a dot-free -c path in `extends` as a parent of the default configuration, which then overrode it
  test("a -c path without a dot is the configuration, not a parent of the default one", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "publish-cli" })
    const configs = await publishInProject(
      projectDir,
      {
        "electron-builder.json": JSON.stringify({ publish: [{ provider: "generic", url: "https://example.com/default" }] }),
        "ci/ebconfig": "publish:\n  - provider: generic\n    url: https://example.com/ci\n",
      },
      "ci/ebconfig"
    )
    expect(configs).toEqual([expect.objectContaining({ provider: "generic", url: "https://example.com/ci" })])
  })

  test("a publishConfiguration override is merged into the configuration's publish list", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "publish-cli" })
    const configs = await publishInProject(
      projectDir,
      { "electron-builder.json": JSON.stringify({ publish: [{ provider: "generic", url: "https://example.com/updates" }] }) },
      undefined,
      { provider: "generic", url: "https://example.com/override", channel: "beta" }
    )
    expect(configs).toEqual([expect.objectContaining({ provider: "generic", url: "https://example.com/override", channel: "beta" })])
  })
})
