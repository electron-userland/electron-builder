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
      ${GetOptions} $R0 "--update" $R2
      ${ifNot} ${Errors}
        StrCpy $0 "$0 --update"
      ${endif}

      ClearErrors
      ${GetParameters} $R0
      ${GetOptions} $R0 "--delete-app-data" $R2
      ${ifNot} ${Errors}
        StrCpy $0 "$0 --delete-app-data"
      ${endif}

      ExecWait '"$PLUGINSDIR\old-uninstaller.exe" /S /KEEP_APP_DATA $0 _?=$R1'
    ${endif}
  ${endif}
!macroend

!macro registryAddInstallInfo
	WriteRegStr SHCTX "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"

	${if} $installMode == "all"
		StrCpy $0 "/allusers"
		StrCpy $1 ""
	${else}
		StrCpy $0 "/currentuser"
		StrCpy $1 " (only current user)"
	${endif}

  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayName "${UNINSTALL_DISPLAY_NAME}$1"
  # https://github.com/electron-userland/electron-builder/issues/750
  StrCpy $2 "$INSTDIR\${UNINSTALL_FILENAME}"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$2" $0'

	WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
	WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
	WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Publisher" "${COMPANY_NAME}"
	WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" NoModify 1
	WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" NoRepair 1

	${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
	IntFmt $0 "0x%08X" $0
	WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" "EstimatedSize" "$0"
!macroend

InitPluginsDir

!ifdef HEADER_ICO
  File /oname=$PLUGINSDIR\installerHeaderico.ico "${HEADER_ICO}"
!endif

${IfNot} ${Silent}
  SetDetailsPrint none

  !ifdef ONE_CLICK
    !ifdef HEADER_ICO
      SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
    !else
      SpiderBanner::Show /MODERN
   !endif
  !endif
${endif}

!ifdef ONE_CLICK
  !insertmacro CHECK_APP_RUNNING "install"
!else
  ${IfNot} ${UAC_IsInnerInstance}
    !insertmacro CHECK_APP_RUNNING "install"
  ${endif}
!endif

!insertmacro uninstallOldVersion SHELL_CONTEXT
${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
${endif}

SetOutPath $INSTDIR

!ifdef APP_BUILD_DIR
  File /r "${APP_BUILD_DIR}/*.*"
!else
  !ifdef COMPRESS
    SetCompress off
  !endif

  !ifdef APP_32
    File /oname=$PLUGINSDIR\app-32.${COMPRESSION_METHOD} "${APP_32}"
  !endif
  !ifdef APP_64
    File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
  !endif

  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif

  !ifdef APP_64
    ${if} ${RunningX64}
      !ifdef ZIP_COMPRESSION
        nsisunz::Unzip "$PLUGINSDIR\app-64.zip" "$INSTDIR"
      !else
        Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
      !endif
    ${else}
      !ifdef ZIP_COMPRESSION
        nsisunz::Unzip "$PLUGINSDIR\app-32.zip" "$INSTDIR"
      !else
        Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
      !endif
    ${endif}
  !else
    !ifdef ZIP_COMPRESSION
      nsisunz::Unzip "$PLUGINSDIR\app-32.zip" "$INSTDIR"
    !else
      Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
    !endif
  !endif
!endif

File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"

!insertmacro registryAddInstallInfo

StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

!insertmacro setLinkVars

!ifdef MENU_FILENAME
  CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
!endif

# create shortcuts in the start menu and on the desktop
# shortcut for uninstall is bad cause user can choose this by mistake during search, so, we don't add it
CreateShortCut "$startMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
CreateShortCut "$desktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"

WinShell::SetLnkAUMI "$startMenuLink" "${APP_ID}"
WinShell::SetLnkAUMI "$desktopLink" "${APP_ID}"

!ifmacrodef registerFileAssociations
  !insertmacro registerFileAssociations
!endif

!ifmacrodef customInstall
  !insertmacro customInstall
!endif

!ifdef ONE_CLICK
  !ifdef RUN_AFTER_FINISH
    ${IfNot} ${Silent}
      # otherwise app window will be in backround
      HideWindow
      Call StartApp
    ${EndIf}
  !endif
  !insertmacro quitSuccess
!endif