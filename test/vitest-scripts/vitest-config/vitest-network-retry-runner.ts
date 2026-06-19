import { TestRunner } from "vitest"

// EPIPE is normal when a CI pipe closes before all output is flushed; suppress it.
for (const stream of [process.stdout, process.stderr] as NodeJS.WriteStream[]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") {
      throw err
    }
  })
}

const NETWORK_PATTERNS = [
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /fetch failed/,
  /getaddrinfo/,
  /Response code 5[0-9][0-9]/,
  /The batch file cannot be found/,
  /[Rr]equest timed out/,
]

const MAX_NETWORK_RETRIES = 2
const RETRY_BASE_DELAY_MS = 2000

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return NETWORK_PATTERNS.some(p => p.test(message))
}

export default class NetworkRetryRunner extends TestRunner {
  override async onBeforeRunTask(test: any): Promise<void> {
    await super.onBeforeRunTask(test)

    const originalFn = TestRunner.getTestFn(test)
    if (!originalFn) {
      return
    }

    // vitest 4 types setTestFn as a 1-arg getter (typeof getFn) but the setter form is still valid at runtime
    ;(TestRunner.setTestFn as unknown as (task: any, fn: () => Promise<void>) => void)(test, async () => {
      for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
        try {
          await originalFn()
          return
        } catch (e) {
          if (!isNetworkError(e) || attempt === MAX_NETWORK_RETRIES) {
            throw e
          }
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
          process.stdout.write(`\n[network-retry] Transient network error in "${test.name}", retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES})...\n`)
          await new Promise(r => setTimeout(r, delay))
        }
      }
    })
  }
}
