import { EventEmitter } from "events"
import BluebirdPromise from "bluebird-lst-c"

export class CancellationToken extends EventEmitter {
  private _cancelled: boolean
  get cancelled(): boolean {
    return this._cancelled || (this._parent != null && this._parent.cancelled)
  }

  private _parent: CancellationToken | null
  set parent(value: CancellationToken) {
    this._parent = value
  }

  // babel cannot compile ... correctly for super calls
  constructor() {
    super()

    this._cancelled = false
  }

  cancel() {
    this._cancelled = true
    this.emit("cancel")
  }

  onCancel(handler: () => any) {
    this.once("cancel", handler)
  }

  trackPromise(promise: BluebirdPromise<any>): BluebirdPromise<any> {
    const handler = () => promise.cancel()
    this.onCancel(handler)
    // it is important to return promise, otherwise will be unhandled rejection error on reject
    return promise.finally(() => this.removeListener("cancel", handler))
  }
}