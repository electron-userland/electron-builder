import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import type { TestProject } from "vitest/node"

/**
 * Creates the directory that holds the package-manager downloads every test of this run shares (corepack's package managers, the npm
 * cache, the pnpm store and the yarn caches; see packageManagerCacheEnv in packTester.ts) and removes it when the run ends. Each run gets
 * its own, so runs from different checkouts on one machine never share a per-worker cache.
 */
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(path.join(tmpdir(), "eb-test-pm-cache-"))
  project.provide("packageManagerCacheDir", dir)
  return async () => {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch (error) {
      // the tests already ran; a file Windows still holds open is teardown flakiness, not a failure
      console.warn(`package manager cache cleanup failed for ${dir}:`, error)
    }
  }
}
