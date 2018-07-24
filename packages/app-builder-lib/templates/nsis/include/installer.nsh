# functions (nsis macro) for installer

!include "extractAppPackage.nsh"

!ifdef APP_PACKAGE_URL
  !include webPackage.nsh
!endif

!macro installApplicationFiles
  !ifdef APP_BUILD_DIR
    File /r "${APP_BUILD_DIR}\*.*"
  !else
    !ifdef APP_PACKAGE_URL
      Var /GLOBAL packageFile
      Var /GLOBAL isPackageFileExplicitlySpecified

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
        StrCpy $isPackageFileExplicitlySpecified "false"
      ${else}
        StrCpy $isPackageFileExplicitlySpecified "true"
      ${endIf}

      # we do not check file hash is specifed explicitly using --package-file because it is clear that user definitly want to use this file and it is user responsibility to check
      # 1. auto-updater uses --package-file and validates checksum
      # 2. user can user another package file (use case - one installer suitable for any app version (use latest version))
      ${if} ${FileExists} "$packageFile"
        ${if} $isPackageFileExplicitlySpecified == "true"
          Goto fun_extract
        ${else}
          ${StdUtils.HashFile} $3 "SHA2-512" "$packageFile"
          ${if} $3 == $1
            Goto fun_extract
          ${else}
            MessageBox MB_OK "Package file $4 found locally, but checksum doesn't match — expected $1, actual $3.$\r$\nLocal file is ignored and package will be downloaded from Internet."
          ${endIf}
        ${endIf}
      ${endIf}

      !insertmacro downloadApplicationFiles

      fun_extract:
        !insertmacro extractUsing7za "$packageFile"

        # electron always uses per user app data
        ${if} $installMode == "all"
          SetShellVarContext current
        ${endif}

        ClearErrors
        Rename "$packageFile" "$APPDATA\${APP_PACKAGE_STORE_FILE}"
        ${if} ${errors}
          # not clear - can NSIS rename on another drive or not, so, in case of error, just copy
          ClearErrors
          CopyFiles /SILENT "$packageFile" "$APPDATA\${APP_PACKAGE_STORE_FILE}"
          Delete "$packageFile"
        ${endif}

        ${if} $installMode == "all"
          SetShellVarContext all
        ${endif}
    !else
      !insertmacro extractEmbeddedAppPackage
      # electron always uses per user app data
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      CopyFiles /SILENT "$EXEPATH" "$APPDATA\${APP_INSTALLER_STORE_FILE}"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
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
		StrCpy $1 ""
	${endIf}

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayName "${UNINSTALL_DISPLAY_NAME}$1"
  # https://github.com/electron-userland/electron-builder/issues/750
  StrCpy $2 "$INSTDIR\${UNINSTALL_FILENAME}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$2" $0'
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString '"$2" $0 /S'

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

  # allow user to define ESTIMATED_SIZE to avoid GetSize call
  !ifdef ESTIMATED_SIZE
    IntFmt $0 "0x%08X" ${ESTIMATED_SIZE}
  !else
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
  !endif
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
      ${if} $keepShortcuts == "false"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      # The keepShortcuts mechanism IS enabled.
      # The desktop shortcut could exist in an obsolete location (due to name change).
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${orIf} ${FileExists} "$oldDesktopLink"
        Rename $oldDesktopLink $newDesktopLink
        WinShell::UninstShortcut "$oldDesktopLink"
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"

      !ifdef RECREATE_DESKTOP_SHORTCUT
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${orIfNot} ${FileExists} "$oldDesktopLink"
        ${ifNot} ${isUpdated}
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${endIf}
      !endif
      ${endIf}
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  !endif
!macroend