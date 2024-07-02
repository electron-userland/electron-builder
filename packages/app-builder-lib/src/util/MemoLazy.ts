/**
 * A reworked implementation of lazy-val (https://github.com/develar/lazy-val/blob/master/src/main.ts)
 * that re-calculates the lazy `value` if the provided argument has changed.
 */

export class MemoLazy<S, V> {
  private selected: S | undefined = undefined
  private _value: Promise<V> | undefined = undefined

  constructor(
    private selector: () => S,
    private creator: (selected: S) => Promise<V>
  ) {}

  get hasValue() {
    return this._value !== undefined
  }

  get value(): Promise<V> {
    const selected = this.selector()
    if (this._value !== undefined && JSON.stringify(this.selected) === JSON.stringify(selected)) {
      // value exists and selected hasn't changed, so return the cached value
      return this._value
    }

    this.selected = selected
    const result = this.creator(selected)
    this.value = result

    return result
  }

  set value(value: Promise<V>) {
    this._value = value
  }
}
