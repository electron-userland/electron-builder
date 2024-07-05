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
    if (this._value !== undefined && equals(this.selected, selected)) {
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

function equals(firstValue: any, secondValue: any): boolean {
  const isFirstObject = typeof firstValue === "object" && firstValue !== null
  const isSecondObject = typeof secondValue === "object" && secondValue !== null

  // do a shallow comparison of objects, arrays etc.
  if (isFirstObject && isSecondObject) {
    const keys1 = Object.keys(firstValue)
    const keys2 = Object.keys(secondValue)

    return keys1.length === keys2.length && keys1.every((key: any) => equals(firstValue[key], secondValue[key]))
  }

  // otherwise just compare the values directly
  return firstValue === secondValue
}
