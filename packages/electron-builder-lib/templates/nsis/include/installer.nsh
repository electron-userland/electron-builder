# Functions (nsis macro) for installer

!include "extractAppPackage.nsh"

# http://stackoverflow.com/questions/24595887/waiting-for-nsis-uninstaller-to-finish-in-nsis-installer-either-fails-or-the-uni
!macro uninstallOldVersion ROOT_KEY
  ReadRegStr $R0 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R0 != ""
    Push $R0
    Call GetInQuotes
    Pop $R1
    ${if} $R1 != ""
      StrCpy $R0 "$R1"
    ${endif}

    ReadRegStr $R1 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $R1 == ""
    ${andIf} $R0 != ""
      # https://github.com/electron-userland/electron-builder/issues/735#issuecomment-246918567
      Push $R0
      Call GetFileParent
      Pop $R1
    ${endif}

    ${if} $R1 != ""
    ${andIf} $R0 != ""
      ClearErrors
      Rename "$R0" "$PLUGINSDIR\old-uninstaller.exe"
      ${if} ${errors}
        # not clear - can NSIS rename on another drive or not, so, in case of error, just copy
        ClearErrors
        CopyFiles /SILENT /FILESONLY "$R0" "$PLUGINSDIR\old-uninstaller.exe"
        Delete "$R0"
      ${endif}

      ${if} $installMode == "CurrentUser"
      ${orIf} ${ROOT_KEY} == "HKEY_CURRENT_USER"
        StrCpy $0 "/currentuser"
      ${else}
        StrCpy $0 "/allusers"
      ${endif}

      !insertMacro setIsTryToKeepShortcuts

      ${if} $isTryToKeepShortcuts == "true"
        ReadRegStr $R5 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts
        # if true, it means that old uninstaller supports --keep-shortcuts flag
        ${if} $R5 == "true"
        ${andIf} ${FileExists} "$appExe"
          StrCpy $0 "$0 --keep-shortcuts"
        ${endIf}
      ${endIf}

      ${if} ${isDeleteAppData}
        StrCpy $0 "$0 --delete-app-data"
      ${else}
        # always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL is defined, user data will be not removed
        StrCpy $0 "$0 --updated"
      ${endif}

      ExecWait '"$PLUGINSDIR\old-uninstaller.exe" /S /KEEP_APP_DATA $0 _?=$R1'
    ${endif}
  ${endif}
!macroend

!ifdef APP_PACKAGE_URL
  !include webPackage.nsh
!endif

!macro installApplicationFiles
  !ifdef APP_BUILD_DIR
    File /r "${APP_BUILD_DIR}\*.*"
  !else
    !ifdef APP_PACKAGE_URL
      Var /GLOBAL packageFile
      ${StdUtils.GetParameter} $packageFile "package-file" ""
      ${if} $packageFile == ""
        !ifdef APP_64_NAME
          !ifdef APP_32_NAME
            ${if} ${RunningX64}
              StrCpy $packageFile "${APP_64_NAME}"
              StrCpy $1 "${APP_64_HASH}"
            ${else}
              StrCpy $packageFile "${APP_32_NAME}"
              StrCpy $1 "${APP_32_HASH}"
            ${endif}
          !else
            StrCpy $packageFile "${APP_64_NAME}"
            StrCpy $1 "${APP_64_HASH}"
          !endif
        !else
          StrCpy $packageFile "${APP_32_NAME}"
          StrCpy $1 "${APP_32_HASH}"
        !endif
        StrCpy $4 "$packageFile"
        StrCpy $packageFile "$EXEDIR/$packageFile"

        ${if} ${FileExists} "$packageFile"
          # we do not check file hash is specifed explicitly using --package-file because it is clear that user definitly want to use this file and it is user responsibility to check
          # 1. auto-updater uses --package-file and validates checksum 2. user can user another package file (use case - one installer suitable for any app version (use latest version))
          ${StdUtils.HashFile} $3 "SHA2-512" "$packageFile"
          ${if} $3 == $1
            Goto fun_extract
          ${else}
            MessageBox MB_OK "Package file $4 found locally, but checksum doesn't match — expected $1, actual $3.$\r$\nLocal file is ignored and package will be downloaded from Internet."
          ${endIf}
        ${endIf}
        !insertmacro downloadApplicationFiles
      ${endIf}

      fun_extract:
        !insertmacro extractUsing7za "$packageFile"

        ClearErrors
        Rename "$packageFile" "$INSTDIR\package.7z"
        ${if} ${errors}
          # not clear - can NSIS rename on another drive or not, so, in case of error, just copy
          ClearErrors
          CopyFiles /SILENT "$packageFile" "$INSTDIR\package.7z"
          Delete "$packageFile"
        ${endif}
    !else
      !insertmacro extractEmbeddedAppPackage
      CopyFiles /SILENT "$EXEPATH" "$APPDATA\${APP_INSTALLER_STORE_FILE}"
    !endif
  !endif

  File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"
!macroend

!macro registryAddInstallInfo
	WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
	WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts "true"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" ShortcutName "${SHORTCUT_NAME}"
  !ifdef MENU_FILENAME
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory "${MENU_FILENAME}"
  !endif

	${if} $installMode == "all"
		StrCpy $0 "/allusers"
		StrCpy $1 ""
	${else}
		StrCpy $0 "/currentuser"
		StrCpy $1 " (only current user)"
	${endIf}

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayName "${UNINSTALL_DISPLAY_NAME}$1"
  # https://github.com/electron-userland/electron-builder/issues/750
  StrCpy $2 "$INSTDIR\${UNINSTALL_FILENAME}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$2" $0'

	WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
	!ifdef UNINSTALLER_ICON
	  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\uninstallerIcon.ico"
	!else
	  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
	!endif

  !ifdef COMPANY_NAME
	  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Publisher" "${COMPANY_NAME}"
	!endif
	WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" NoModify 1
	WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" NoRepair 1

	${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
	IntFmt $0 "0x%08X" $0
	WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "EstimatedSize" "$0"
!macroend

!macro cleanupOldMenuDirectory
  ${if} $oldMenuDirectory != ""
    !ifdef MENU_FILENAME
      ${if} $oldMenuDirectory != "${MENU_FILENAME}"
        RMDir "$SMPROGRAMS\$oldMenuDirectory"
      ${endIf}
    !else
      RMDir "$SMPROGRAMS\$oldMenuDirectory"
    !endif
  ${endIf}
!macroend

!macro createMenuDirectory
  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    ClearErrors
  !endif
!macroend

!macro addStartMenuLink keepShortcuts
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    # The keepShortcuts mechanism is NOT enabled.
    # Menu shortcut will be recreated.
    ${if} $keepShortcuts  == "false"
      !insertmacro cleanupOldMenuDirectory
      !insertmacro createMenuDirectory

      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      # clear error (if shortcut already exists)
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    # The keepShortcuts mechanism IS enabled.
    # The menu shortcut could either not exist (it shouldn't be recreated) or exist in an obsolete location.
    ${elseif} $oldStartMenuLink != $newStartMenuLink
    ${andIf} ${FileExists} "$oldStartMenuLink"
      !insertmacro createMenuDirectory

      Rename $oldStartMenuLink $newStartMenuLink
      WinShell::UninstShortcut "$oldStartMenuLink"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

      !insertmacro cleanupOldMenuDirectory
    ${endIf}
  !endif
!macroend

!macro addDesktopLink keepShortcuts
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    # https://github.com/electron-userland/electron-builder/pull/1432
    ${ifNot} ${isNoDesktopShortcut}
      # The keepShortcuts mechanism is NOT enabled.
      # Shortcuts will be recreated.
      ${if} $keepShortcuts  == "false"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      # The keepShortcuts mechanism IS enabled.
      # The desktop shortcut could exist in an obsolete location (due to name change).
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${andIf} ${FileExists} "$oldDesktopLink"
        Rename $oldDesktopLink $newDesktopLink
        WinShell::UninstShortcut "$oldDesktopLink"
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      ${endIf}
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  !endif
!macroend

Var /GLOBAL isTryToKeepShortcuts

!macro setIsTryToKeepShortcuts
  StrCpy $isTryToKeepShortcuts "true"
  !ifdef allowToChangeInstallationDirectory
    ${ifNot} ${isUpdated}
      StrCpy $isTryToKeepShortcuts "false"
    ${endIf}
  !endif
!macroend