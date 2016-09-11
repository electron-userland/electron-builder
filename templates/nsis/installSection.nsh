# http://stackoverflow.com/questions/24595887/waiting-for-nsis-uninstaller-to-finish-in-nsis-installer-either-fails-or-the-uni
!macro uninstallOldVersion ROOT_KEY
  ReadRegStr $R0 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R0 != ""
    Push $R0
    Call GetInQuotes
    Pop $R0

    ReadRegStr $R1 ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $R1 != ""
    ${AndIf} $R0 != ""
      CopyFiles /SILENT /FILESONLY "$R0" "$PLUGINSDIR\old-uninstaller.exe"

      ${if} $installMode == "CurrentUser"
      ${OrIf} ${ROOT_KEY} == "HKEY_CURRENT_USER"
        StrCpy $0 "/currentuser"
      ${else}
        StrCpy $0 "/allusers"
      ${endif}
#      MessageBox MB_OK|MB_ICONEXCLAMATION '"$PLUGINSDIR\old-uninstaller.exe" "_?=$R1" /S /KEEP_APP_DATA $0'
      ExecWait '"$PLUGINSDIR\old-uninstaller.exe" "_?=$R1" /S /KEEP_APP_DATA $0'
    ${endif}
  ${endif}
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

SetCompress off
!ifdef APP_32
  File /oname=$PLUGINSDIR\app-32.7z "${APP_32}"
!endif
!ifdef APP_64
  File /oname=$PLUGINSDIR\app-64.7z "${APP_64}"
!endif
SetCompress "${COMPRESS}"

!ifdef APP_64
  ${if} ${RunningX64}
    Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
  ${else}
    Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
  ${endif}
!else
  Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
!endif

File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"

StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"
StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

!insertmacro registryAddInstallInfo

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