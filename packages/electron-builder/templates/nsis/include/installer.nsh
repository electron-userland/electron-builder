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
      CopyFiles /SILENT /FILESONLY "$R0" "$PLUGINSDIR\old-uninstaller.exe"

      ${if} $installMode == "CurrentUser"
      ${orIf} ${ROOT_KEY} == "HKEY_CURRENT_USER"
        StrCpy $0 "/currentuser"
      ${else}
        StrCpy $0 "/allusers"
      ${endif}

      !ifndef allowToChangeInstallationDirectory
        ReadRegStr $R5 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts
        # if true, it means that old uninstaller supports --keep-shortcuts flag
        ${if} $R5 == "true"
        ${andIf} ${FileExists} "$appExe"
          StrCpy $0 "$0 --keep-shortcuts"
        ${endIf}
      !endif

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
  !ifdef SEVEN_ZIP_FILE
    File /oname=$PLUGINSDIR\7za.exe "${SEVEN_ZIP_FILE}"
  !endif

  !ifdef APP_BUILD_DIR
    File /r "${APP_BUILD_DIR}/*.*"
  !else
    !ifdef APP_PACKAGE_URL
      ${StdUtils.GetParameter} $R0 "package-file" ""
      ${if} $R0 == ""
        !insertmacro downloadApplicationFiles
      ${else}
        !insertmacro extractUsing7za "$R0"
      ${endIf}
    !else
      !insertmacro extractEmbeddedAppPackage
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
        RMDir /r "$SMPROGRAMS\$oldMenuDirectory"
      ${endIf}
    !else
      RMDir /r "$SMPROGRAMS\$oldMenuDirectory"
    !endif
  ${endIf}
!macroend

!macro addStartMenuLink
  !insertmacro cleanupOldMenuDirectory

  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    ClearErrors
  !endif

  ${if} $oldStartMenuLink != $newStartMenuLink
  ${andIf} ${FileExists} "$oldStartMenuLink"
    Rename $oldStartMenuLink $newStartMenuLink
    WinShell::UninstShortcut "$oldStartMenuLink"
  ${else}
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    # clear error (if shortcut already exists)
    ClearErrors
  ${endIf}

  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
!macroend

!macro addDesktopLink
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    # https://github.com/electron-userland/electron-builder/pull/1432
    ${ifNot} ${isNoDesktopShortcut}
      ${if} $oldDesktopLink != $newDesktopLink
      ${andIf} ${FileExists} "$oldDesktopLink"
        Rename $oldDesktopLink $newDesktopLink
        WinShell::UninstShortcut "$oldDesktopLink"
      ${else}
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
      ${endIf}

      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  !endif
!macroend