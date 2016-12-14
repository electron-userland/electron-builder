import * as path from "path"
import { tmpdir } from "os"
import { createHash } from "crypto"

// reuse to avoid stale data (maybe not removed correctly on test stop)
// use __dirname to allow run in parallel from different project clones
export const TEST_DIR = path.join(tmpdir(), `et-${createHash("md5").update(__dirname).digest("hex")}`)
export const ELECTRON_VERSION = "1.4.12"