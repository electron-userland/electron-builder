import { createHash } from "crypto"
import { tmpdir } from "os"
import * as path from "path"

// reuse to avoid stale data (maybe not removed correctly on test stop)
// use __dirname to allow run in parallel from different project clones
// on macOs use /tmp otherwise docker test fails
/*
docker: Error response from daemon: Mounts denied: o Docker.
      You can configure shared paths from Docker -> Preferences... -> File Sharing.
 */
const baseDir = process.env.ELECTRON_BUILDER_TEST_DIR || (process.platform === "darwin" && !require("is-ci") ? "/tmp" : tmpdir())
export const TEST_DIR = path.join(baseDir, `et-${createHash("md5").update(__dirname).digest("hex")}`)
export const ELECTRON_VERSION = "1.6.0"