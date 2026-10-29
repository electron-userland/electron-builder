import { CancellationToken, HttpExecutor } from "builder-util-runtime"
import { EventEmitter } from "events"
import { expect, test, vi } from "vitest"

class BufferExecutor extends HttpExecutor<any> {
  readonly response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    statusMessage: "OK",
    headers: {},
    destroy: vi.fn(),
  })

  createRequest(_options: unknown, callback: (response: any) => void) {
    return Object.assign(new EventEmitter(), {
      abort: vi.fn(),
      end: () => callback(this.response),
    })
  }
}

test("stops reading a buffer download after the size limit", async () => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update"), {
    cancellationToken: new CancellationToken(),
  })

  executor.response.emit("data", { length: 524288001 })
  executor.response.emit("data", Buffer.from("ignored"))
  executor.response.emit("end")

  await expect(download).rejects.toThrow("Maximum allowed size is 500 MB")
  expect(executor.response.destroy).toHaveBeenCalledOnce()
})

test("stops reading a buffer download after a custom size limit", async () => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update.blockmap"), { cancellationToken: new CancellationToken() }, 1000)

  executor.response.emit("data", Buffer.alloc(600))
  executor.response.emit("data", Buffer.alloc(401))
  executor.response.emit("end")

  await expect(download).rejects.toThrow("Maximum allowed size is 1000 bytes")
  expect(executor.response.destroy).toHaveBeenCalledOnce()
})

test("a buffer download at the custom size limit succeeds", async () => {
  const executor = new BufferExecutor()
  const download = executor.downloadToBuffer(new URL("https://example.com/update.blockmap"), { cancellationToken: new CancellationToken() }, 1000)

  executor.response.emit("data", Buffer.alloc(1000, 1))
  executor.response.emit("end")

  expect((await download).equals(Buffer.alloc(1000, 1))).toBe(true)
})
