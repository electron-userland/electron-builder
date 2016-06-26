# 32 bit + 64 bit

If you build both ia32 and xha arch, you in any case get one installer. Appropriate arch will be installed automatically.

# GUID vs Application Name

Windows requires to use registry keys (e.g. INSTALL/UNINSTALL info). Squirrel.Windows simply uses application name as key.
But it is not robust — Google can use key Google Chrome SxS, because it is a Google.

So, it is better to use [GUID](http://stackoverflow.com/a/246935/1910191).
You are not forced to explicitly specify it — name-based [UUID v5](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_5_.28SHA-1_hash_.26_namespace.29) will be generated from your [appId](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-appId) or [name](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-name).
It means that you **should not change appId** once your application in use (or name if `appId` was not set). Application product name (title) or description can be safely changed.

You can explicitly set guid using option [nsis.guid](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-guid), but it is not recommended — consider using [appId](https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-appId).