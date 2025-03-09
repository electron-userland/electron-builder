import { MemoLazy } from "builder-util-runtime"
import { Lazy } from "lazy-val"

test("[Lazy] reuses the created value even if the selected value has changed", async ({ expect }) => {
  let selectedValue = 0
  const lazy = new Lazy(() => {
    return Promise.resolve(selectedValue * 10)
  })

  selectedValue++
  expect(await lazy.value).toBe(10)

  selectedValue++
  expect(await lazy.value).toBe(10)
})

test("[MemoLazy] recomputes the created value if the selected value has changed", async ({ expect }) => {
  let selectedValue = 0
  const lazy = new MemoLazy(
    () => selectedValue,
    selectedValue => {
      return Promise.resolve(selectedValue * 10)
    }
  )

  selectedValue++
  expect(await lazy.value).toBe(10)

  selectedValue++
  expect(await lazy.value).toBe(20)
})

test("[MemoLazy] recomputes the created value if the selected deep/internal value has changed", async ({ expect }) => {
  let selectedValue = { deep: { property: { here: 0 } } }
  const lazy = new MemoLazy(
    () => selectedValue,
    selectedValue => {
      return Promise.resolve(selectedValue.deep.property.here)
    }
  )

  expect(await lazy.value).toBe(0)

  selectedValue = { deep: { property: { here: 10 } } }
  expect(await lazy.value).toBe(10)
})
