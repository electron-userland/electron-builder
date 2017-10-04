# asar-integrity

Compute checksums of `asar` files.

```ts
import { computeData } from "asar-integrity"

const data = await computeData(resourcesPath, {externalAllowed: false})
```