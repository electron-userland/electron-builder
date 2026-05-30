import { getFn, setFn } from "vitest/suite"
import { VitestTestRunner } from "vitest/runners"

const NETWORK_PATTERNS = [/ENOTFOUND/, /ETIMEDOUT/, /ECONNRESET/, /fetch failed/, /getaddrinfo/]

const MAX_NETWORK_RETRIES = 2
const RETRY_BASE_DELAY_MS = 2000

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return NETWORK_PATTERNS.some(p => p.test(message))
}

export default class NetworkRetryRunner extends VitestTestRunner {
  override async onBeforeRunTask(test: any): Promise<void> {
    await super.onBeforeRunTask(test)

    const originalFn = getFn(test)
    if (!originalFn) {
      return
    }

    setFn(test, async () => {
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
