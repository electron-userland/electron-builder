It is developer documentation. See [wiki](https://github.com/electron-userland/electron-builder/wiki/nsis).

http://www.mathiaswestin.net/2012/09/how-to-make-per-user-installation-with.html

https://msdn.microsoft.com/en-us/library/windows/desktop/dd378457(v=vs.85).aspx#FOLDERID_UserProgramFiles

https://github.com/Drizin/NsisMultiUser

NSIS vs Inno Setup — it is not easy to choose because both are far from ideal, e.g. inno also doesn't have built-in per-user installation implementation — http://stackoverflow.com/questions/34330668/inno-setup-custom-dialog-with-per-user-or-per-machine-installation.

http://stackoverflow.com/questions/2565215/checking-if-the-application-is-running-in-nsis-before-uninstalling

One-click installer: http://forums.winamp.com/showthread.php?t=300479

# GUID
See NSIS.md.

We use https://github.com/scravy/uuid-1345 to generate sha-1 name-based UUID.

http://stackoverflow.com/questions/3029994/convert-uri-to-guid
https://alexandrebrisebois.wordpress.com/2013/11/14/create-predictable-guids-for-your-windows-azure-table-storage-entities/
https://github.com/Squirrel/Squirrel.Windows/pull/658