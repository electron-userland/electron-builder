import { Logger } from "builder-util"
import * as path from "path"

const logger = new Logger(process.stdout)

test("shortens paths inside the working directory", ({ expect }) => {
  expect(logger.filePath(path.join(process.cwd(), "build", "artifact.zip"))).toBe(path.join("build", "artifact.zip"))
})

test("preserves paths in directories that only share the working-directory prefix", ({ expect }) => {
  const siblingPath = `${process.cwd()}-other${path.sep}artifact.zip`

  expect(logger.filePath(siblingPath)).toBe(siblingPath)
})
