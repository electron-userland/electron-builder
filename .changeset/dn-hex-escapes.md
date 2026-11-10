---
"builder-util-runtime": patch
---

fix: escaped characters in a Windows `publisherName` distinguished name are decoded correctly. Before, a hex pair was decoded as a single Latin-1 character (`Caf\C3\A9` became `CafÃ©` instead of `Café`), and a `\+` or `\ ` escape followed by a hex digit was read as a hex pair (`Acme\+Bolt` lost the `B`), so such a publisher name never matched the signing certificate and electron-updater rejected the update
