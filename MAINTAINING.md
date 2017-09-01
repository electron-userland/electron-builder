# Typings

All typings are added into root `package.json` to avoid duplication errors in the IDE compiler (several `node.d.ts` files).

# ^ or ~ for package dependencies?

For `electron-builder-http` `~` is used because if something fixed in this module, all clients should be updated as well (to ensure, that client will get update versions).

For `builder-util` `^` is used, because often new methods are added to this module, and if `~` will be used, we will be forced to release dependent packages very often and it can create unnecessary noise.