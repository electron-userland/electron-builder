---
"builder-util-runtime": patch
---

feat: `blockMapV2ToV3Keys` (internal) converts a parsed v2 block map to the block keys `toBlockMap` gives a v3 map, so maps of the two formats can be compared block by block; it rejects a map whose checksums are not base64 blake2b-18 digests or whose blocks a v3 record cannot hold
