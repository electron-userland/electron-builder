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

# http://stackoverflow.com/questions/24595887/waiting-for-nsis-uninstaller-to-finish-in-nsis-installer-either-fails-or-the-uni

ReadRegStr $R0 SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallerPath
${if} $R0 != ""
  ReadRegStr $R1 SHCTX "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R1 != ""
    CopyFiles /SILENT /FILESONLY "$R0" "$PLUGINSDIR\old-uninstaller.exe"

    ${if} $installMode == "all"
      ExecWait "$PLUGINSDIR\old-uninstaller.exe _?=$R1 /S /KEEP_APP_DATA /allusers"
    ${Else}
      ExecWait "$PLUGINSDIR\old-uninstaller.exe _?=$R1 /S /KEEP_APP_DATA /currentuser"
    ${endif}
  ${endif}
${endif}

# remove per-user installation
${if} $installMode == "all"
  ReadRegStr $R0 HKEY_CURRENT_USER "${UNINSTALL_REGISTRY_KEY}" UninstallerPath
  ${if} $R0 != ""
    ReadRegStr $R1 HKEY_CURRENT_USER "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $R1 != ""
      CopyFiles /SILENT /FILESONLY "$R0" "$PLUGINSDIR\old-uninstaller.exe"
      ExecWait "$PLUGINSDIR\old-uninstaller.exe _?=$R1 /S /KEEP_APP_DATA /currentuser"
    ${endif}
  ${endif}
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
  ${If} ${RunningX64}
    Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
  ${Else}
    Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
  ${endif}
!else
  Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
!endif

File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"

!insertmacro registryAddInstallInfo

StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"
StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

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
  Quit
!endif
