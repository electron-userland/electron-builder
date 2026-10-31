---
"builder-util-runtime": patch
---

fix(runtime): the `reject` that `CancellationToken.createPromise` passes to its callback takes any value, `(error: unknown) => void`, as a promise rejects with any value
