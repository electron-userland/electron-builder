import { Arch } from "builder-util"
import { createUploadTasks } from "../../packages/electron-builder/src/publish"

test("deduplicates publish tasks by file and architecture", ({ expect }) => {
  const tasks = createUploadTasks([
    { file: "/tmp/app.zip", arch: "x64" },
    { file: "/tmp/app.zip", arch: "x64" },
    { file: "/tmp/app.zip", arch: "arm64" },
  ])

  expect(tasks).toHaveLength(2)
  expect(tasks.map(task => task.arch)).toEqual([Arch.x64, Arch.arm64])
})
