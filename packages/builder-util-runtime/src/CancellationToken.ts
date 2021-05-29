import { EventEmitter } from "events"

export class CancellationToken extends EventEmitter {
  private parentCancelHandler: (() => any) | null = null

  private _cancelled: boolean
  get cancelled(): boolean {
    return this._cancelled || (this._parent != null && this._parent.cancelled)
  }

  private _parent: CancellationToken | null = null
  set parent(value: CancellationToken) {
    this.removeParentCancelHandler()

    this._parent = value
    this.parentCancelHandler = () => this.cancel()
    this._parent.onCancel(this.parentCancelHandler)
  }

  // babel cannot compile ... correctly for super calls
  constructor(parent?: CancellationToken) {
    super()

    this._cancelled = false
    if (parent != null) {
      this.parent = parent
    }
  }

  cancel() {
    this._cancelled = true
    this.emit("cancel")
  }

  private onCancel(handler: () => any) {
    if (this.cancelled) {
      handler()
    } else {
      this.once("cancel", handler)
    }
  }

  createPromise<R>(
    callback: (resolve: (thenableOrResult: R | PromiseLike<R>) => void, reject: (error: Error) => void, onCancel: (callback: () => void) => void) => void
  ): Promise<R> {
    if (this.cancelled) {
      return Promise.reject<R>(new CancellationError())
    }

    const finallyHandler = () => {
      if (cancelHandler != null) {
        try {
          this.removeListener("cancel", cancelHandler)
          cancelHandler = null
        } catch (ignore) {
          // ignore
        }
      }
    }

    let cancelHandler: (() => void) | null = null
    return new Promise<R>((resolve, reject) => {
      let addedCancelHandler: (() => void) | null = null

      cancelHandler = () => {
        try {
          if (addedCancelHandler != null) {
            addedCancelHandler()
            addedCancelHandler = null
          }
        } finally {
          reject(new CancellationError())
        }
      }

      if (this.cancelled) {
        cancelHandler()
        return
      }

      this.onCancel(cancelHandler)

      callback(resolve, reject, (callback: () => void) => {
        addedCancelHandler = callback
      })
    })
      .then(it => {
        finallyHandler()
        return it
      })
      .catch(e => {
        finallyHandler()
        throw e
      })
  }

  private removeParentCancelHandler() {
    const parent = this._parent
    if (parent != null && this.parentCancelHandler != null) {
      parent.removeListener("cancel", this.parentCancelHandler)
      this.parentCancelHandler = null
    }
  }

  dispose() {
    try {
      this.removeParentCancelHandler()
    } finally {
      this.removeAllListeners()
      this._parent = null
    }
  }
}

export class CancellationError extends Error {
  constructor() {
    super("cancelled")
  }
}
