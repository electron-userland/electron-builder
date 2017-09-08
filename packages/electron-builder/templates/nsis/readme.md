It is developer documentation. See [user documentation](https://electron.build/configuration/nsis).

http://www.mathiaswestin.net/2012/09/how-to-make-per-user-installation-with.html

https://msdn.microsoft.com/en-us/library/windows/desktop/dd378457(v=vs.85).aspx#FOLDERID_UserProgramFiles

https://github.com/Drizin/NsisMultiUser

NSIS vs Inno Setup — it is not easy to choose because both are far from ideal, e.g. inno also doesn't have built-in per-user installation implementation — http://stackoverflow.com/questions/34330668/inno-setup-custom-dialog-with-per-user-or-per-machine-installation.

http://stackoverflow.com/questions/2565215/checking-if-the-application-is-running-in-nsis-before-uninstalling

One-click installer: http://forums.winamp.com/showthread.php?t=300479

# GUID
See [docs](https://electron.build/configuration/nsis).

We use UUID v5 to generate sha-1 name-based UUID.

http://stackoverflow.com/questions/3029994/convert-uri-to-guid
https://alexandrebrisebois.wordpress.com/2013/11/14/create-predictable-guids-for-your-windows-azure-table-storage-entities/
https://github.com/Squirrel/Squirrel.Windows/pull/658

# Compression

NSIS LZMA compression is slower and worse compared to external `7za` compression. Slower because `7za` is multi-threaded, worse because LZMA codec implementation is outdated and BCJ2 filter is not enabled.
Difference for test app — 4 MB (before: 36.3 after: 32.8).

And compression time is also greatly reduced.

Since NSIS is awesome, no disadvantages in our approach — [compression is disabled](http://nsis.sourceforge.net/Reference/SetCompress) before `File /oname=app.7z "${APP_ARCHIVE}"` and enabled after (it is the reasons why `SOLID` compression is not used).
So, opposite to Squirrel.Windows, archive is not twice compressed.

So, in your custom NSIS scripts you should not use any compression instructions. Only `SetCompress` if you need to disable compression for already archived file.


