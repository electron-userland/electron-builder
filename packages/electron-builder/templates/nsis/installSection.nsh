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

      ClearErrors
      ${GetParameters} $R0
      ${GetOptions} $R0 "--delete-app-data" $R2
      ${ifNot} ${Errors}
        StrCpy $0 "$0 --delete-app-data"
      ${else}
        # always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL is defined, user data will be not removed
        StrCpy $0 "$0 --updated"
      ${endif}

      ExecWait '"$PLUGINSDIR\old-uninstaller.exe" /S /KEEP_APP_DATA $0 $shortcuts _?=$R1'
    ${endif}
  ${endif}
!macroend

!macro registryAddInstallInfo
	WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
	WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts "true"

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

InitPluginsDir

${IfNot} ${Silent}
  SetDetailsPrint none
${endif}

StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
Var /GLOBAL shortcuts
StrCpy $shortcuts ""
!ifndef allowToChangeInstallationDirectory
  ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts

  ${if} $R1 == "true"
  ${andIf} ${FileExists} "$appExe"
    StrCpy $shortcuts "--keep-shortcuts"
  ${endIf}
!endif

!ifdef ONE_CLICK
  !ifdef HEADER_ICO
    File /oname=$PLUGINSDIR\installerHeaderico.ico "${HEADER_ICO}"
  !endif
  ${IfNot} ${Silent}
    !ifdef HEADER_ICO
      SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
    !else
      SpiderBanner::Show /MODERN
    !endif

    FindWindow $0 "#32770" "" $hwndparent
    FindWindow $0 "#32770" "" $hwndparent $0
    GetDlgItem $0 $0 1000
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(installing)"
  ${endif}
  !insertmacro CHECK_APP_RUNNING
!else
  ${ifNot} ${UAC_IsInnerInstance}
    !insertmacro CHECK_APP_RUNNING
  ${endif}
!endif

!insertmacro uninstallOldVersion SHELL_CONTEXT
${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
${endif}

SetOutPath $INSTDIR

!ifdef UNINSTALLER_ICON
  File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
!endif

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

!insertmacro registryAddInstallInfo
!insertmacro setLinkVars

!ifdef MENU_FILENAME
  CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
!endif

${if} $shortcuts == ""
  # create shortcuts in the start menu and on the desktop
  # shortcut for uninstall is bad cause user can choose this by mistake during search, so, we don't add it
  CreateShortCut "$startMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  WinShell::SetLnkAUMI "$startMenuLink" "${APP_ID}"

  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--no-desktop-shortcut" $R1
  ${If} ${Errors}
    CreateShortCut "$desktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$desktopLink" "${APP_ID}"
  ${endIf}
${endif}

!ifmacrodef registerFileAssociations
  !insertmacro registerFileAssociations
!endif

!ifmacrodef customInstall
  !insertmacro customInstall
!endif

!ifdef ONE_CLICK
  !ifdef RUN_AFTER_FINISH
    ${IfNot} ${Silent}
    ${OrIf} ${ForceRun}
      # otherwise app window will be in backround
      HideWindow
      !insertmacro StartApp
    ${EndIf}
  !endif
  !insertmacro quitSuccess
!endif