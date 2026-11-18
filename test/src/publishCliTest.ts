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
