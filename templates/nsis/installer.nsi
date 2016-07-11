!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"
!include "nsProcess.nsh"
!include "allowOnlyOneInstallerInstace.nsh"
!include "checkAppRunning.nsh"
!include WinVer.nsh

!ifdef ONE_CLICK
  Function StartApp
    !ifdef INSTALL_MODE_PER_ALL_USERS
      !include UAC.nsh
      !insertmacro UAC_AsUser_ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "" "" ""
    !else
      ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    !endif
  FunctionEnd

  SilentUnInstall silent
  AutoCloseWindow true
  !insertmacro MUI_PAGE_INSTFILES
  !insertmacro MUI_UNPAGE_INSTFILES

  !ifdef INSTALL_MODE_PER_ALL_USERS
    RequestExecutionLevel admin
  !else
    RequestExecutionLevel user
  !endif
!else
  !include "boring-installer.nsh"
!endif

Var startMenuLink
Var desktopLink

Function .onInit
  !insertmacro check64BitAndSetRegView
  !insertmacro initMultiUser "" ""

  !ifdef ONE_CLICK
    !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTACE
  !else
    ${IfNot} ${UAC_IsInnerInstance}
      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTACE
    ${EndIf}
  !endif

  InitPluginsDir

  SetCompress off
  !ifdef APP_32
    File /oname=$PLUGINSDIR\app-32.7z "${APP_32}"
  !endif
  !ifdef APP_64
    File /oname=$PLUGINSDIR\app-64.7z "${APP_64}"
  !endif
  SetCompress "${COMPRESS}"

  !ifdef HEADER_ICO
    File /oname=$PLUGINSDIR\installerHeaderico.ico "${HEADER_ICO}"
  !endif
FunctionEnd

Function un.onInit
  !insertmacro check64BitAndSetRegView
  !insertmacro initMultiUser Un un.
FunctionEnd

Section "install"
  SetDetailsPrint none

  !ifdef ONE_CLICK
    !ifdef HEADER_ICO
      SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
    !else
      SpiderBanner::Show /MODERN
   !endif
  !endif

  !insertmacro CHECK_APP_RUNNING "install"

  RMDir /r $INSTDIR
  SetOutPath $INSTDIR

  !ifdef APP_64
    ${If} ${RunningX64}
      Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
    ${Else}
      Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
    ${EndIf}
  !else
    Nsis7z::Extract "$PLUGINSDIR\app-32.7z"
  !endif

#  <% if(fileAssociation){ %>
    # specify file association
#    ${registerExtension} "$INSTDIR\${PRODUCT_FILENAME}.exe" "<%= fileAssociation.extension %>" "<%= fileAssociation.fileType %>"
#  <% } %>

  WriteUninstaller "${UNINSTALL_FILENAME}"
  !insertmacro MULTIUSER_RegistryAddInstallInfo

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"

  # create shortcuts in the start menu and on the desktop
  # shortcut for uninstall is bad cause user can choose this by mistake during search, so, we don't add it
  CreateShortCut "$startMenuLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
  CreateShortCut "$desktopLink" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"

  WinShell::SetLnkAUMI "$startMenuLink" "${APP_ID}"
  WinShell::SetLnkAUMI "$desktopLink" "${APP_ID}"

  !ifdef ONE_CLICK
    # otherwise app window will be in backround
    HideWindow
    Call StartApp
  !endif
SectionEnd

Section "un.install"
  SetAutoClose true

  !insertmacro CHECK_APP_RUNNING "uninstall"

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_FILENAME}.lnk"

  WinShell::UninstAppUserModelId "${APP_ID}"
  WinShell::UninstShortcut "$startMenuLink"
  WinShell::UninstShortcut "$desktopLink"

  Delete "$startMenuLink"
  Delete "$desktopLink"

  # delete the installed files
  RMDir /r $INSTDIR

  RMDir /r "$APPDATA\${PRODUCT_FILENAME}"

  !insertmacro MULTIUSER_RegistryRemoveInstallInfo
SectionEnd