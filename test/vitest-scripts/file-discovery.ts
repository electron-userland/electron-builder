import * as fs from "fs"
import * as path from "path"
import { IS_LINUX, IS_MAC, IS_WIN, isUnstableTest, normalizePath, TargetPlatform, TEST_ROOT } from "./smart-config"

export function platformAllowed(file: string, platform: TargetPlatform = "current"): boolean {
  if (platform === "current") {
    // Use current runtime platform
    if (file.includes(".mac.")) {
      return IS_MAC
    }
    if (file.includes(".win.")) {
      return IS_WIN
    }
    if (file.includes(".linux.")) {
      return IS_LINUX
    }
    return true
  }

  // Check for specific platform
  if (file.includes(".mac.")) {
    return platform === "darwin"
  }
  if (file.includes(".win.")) {
    return platform === "win32"
  }
  if (file.includes(".linux.")) {
    return platform === "linux"
  }
  return true
}

const testOverride = process.env.TEST_FILES?.trim()?.split(",")

function collectTests(dir: string, platform: TargetPlatform = "current", out: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return out
  }

  for (const name of fs.readdirSync(dir)) {
    if ([".ts.map", ".js.map", ".d.ts", ".snap"].some(ext => name.endsWith(ext)) || ["node_modules", "out"].includes(name) || isUnstableTest(name, platform)) {
      continue
    }

    const full = path.join(dir, name)

    if (!name.startsWith(".") && fs.statSync(full).isDirectory()) {
      collectTests(full, platform, out)
    } else {
      if (testOverride && testOverride.some(toMatch => name.includes(toMatch))) {
        out.push(normalizePath(full))
      } else if (name.endsWith("Test.ts") || name.endsWith("test.ts")) {
        out.push(normalizePath(full))
      }
    }
  }

  return out
}

export function getAllTestFiles(platform: TargetPlatform = "current"): string[] {
  return collectTests(TEST_ROOT, platform).filter(file => platformAllowed(file, platform))
}
