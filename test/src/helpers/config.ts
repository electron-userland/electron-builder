import * as path from "path"
import { tmpdir } from "os"

export const TEST_DIR = path.join(tmpdir(), `electron-builder-test-${process.pid.toString(16)}`)
export const ELECTRON_VERSION = "1.3.5"