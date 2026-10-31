---
"electron-updater": major
---

fix(updater)!: a deb/rpm/pacman update installed with gksudo, kdesudo or beesu needs an installer path of ASCII letters, digits and `._/+,:=@%-` (and a space with kdesudo), and non-ASCII characters other than control, format and separator characters, the characters their single command string carries safely; any other path fails with `ERR_UPDATER_UNSAFE_INSTALLER_PATH` before the helper runs. pkexec and sudo take any path.
