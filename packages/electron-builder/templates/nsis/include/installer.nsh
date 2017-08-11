# Functions (nsis macro) for installer

!macro installApplicationFiles
  !ifdef APP_BUILD_DIR
    File /r "${APP_BUILD_DIR}/*.*"
  !else
    !ifdef APP_PACKAGE_URL
      Var /GLOBAL packageUrl
      Var /GLOBAL packageArch

      StrCpy $packageUrl "${APP_PACKAGE_URL}"
      StrCpy $packageArch "${APP_PACKAGE_URL}"

      !ifdef APP_PACKAGE_URL_IS_INCOMLETE
        !ifdef APP_64_NAME
          !ifdef APP_32_NAME
            ${if} ${RunningX64}
              StrCpy $packageUrl "$packageUrl/${APP_64_NAME}"
            ${else}
              StrCpy $packageUrl "$packageUrl/${APP_32_NAME}"
            ${endif}
          !else
            StrCpy $packageUrl "$packageUrl/${APP_64_NAME}"
          !endif
        !else
          StrCpy $packageUrl "$packageUrl/${APP_32_NAME}"
        !endif
      !endif

      ${if} ${RunningX64}
        StrCpy $packageArch "64"
      ${else}
        StrCpy $packageArch "32"
      ${endif}

      download:
      inetc::get /header "X-Arch: $packageArch" /RESUME "" "$packageUrl" "$PLUGINSDIR\package.7z" /END
      Pop $0
      ${if} $0 == "Cancelled"
        quit
      ${elseif} $0 != "OK"
        Messagebox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Unable to download application package from $packageUrl (status: $0).$\r$\n$\r$\nPlease check you Internet connection and retry." IDRETRY download
        quit
      ${endif}

      Nsis7z::Extract "$PLUGINSDIR\package.7z"
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
	${endif}

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