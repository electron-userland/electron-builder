!include "MUI2.nsh"
!include "NsisMultiUser.nsh"
!include "nsProcess.nsh"
!include "allowOnlyOneInstallerInstace.nsh"
!include "checkAppRunning.nsh"

Function StartApp
  ExecShell "" "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
FunctionEnd

!ifndef ONE_CLICK
  !include "boring-installer.nsh"
!endif

!ifdef ONE_CLICK
  !insertmacro MUI_PAGE_INSTFILES
  !insertmacro MUI_UNPAGE_INSTFILES
!endif

Var startMenuLink
Var desktopLink

Function .onInit
  !insertmacro MULTIUSER_INIT
  !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTACE
  !insertmacro CHECK_APP_RUNNING "install"
FunctionEnd

Function un.onInit
  !insertmacro MULTIUSER_UNINIT
FunctionEnd

# default section start
Section "install"
  SetDetailsPrint none

  # delete the installed files
  RMDir /r $INSTDIR

  # define the path to which the installer should install
  SetOutPath $INSTDIR

  SetCompress off
  File /oname=app.7z "${APP_ARCHIVE}"
  SetCompress "${COMPRESS}"

  Nsis7z::Extract "app.7z"
  Delete "app.7z"

#  <% if(fileAssociation){ %>
    # specify file association
#    ${registerExtension} "$INSTDIR\${PRODUCT_NAME}.exe" "<%= fileAssociation.extension %>" "<%= fileAssociation.fileType %>"
#  <% } %>

  WriteUninstaller "${UNINSTALL_FILENAME}"
  !insertmacro MULTIUSER_RegistryAddInstallInfo

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_NAME}.lnk"

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
  !insertmacro CHECK_APP_RUNNING "uninstall"

  StrCpy $startMenuLink "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  StrCpy $desktopLink "$DESKTOP\${PRODUCT_NAME}.lnk"

  WinShell::UninstAppUserModelId "${APP_ID}"
  WinShell::UninstShortcut "$startMenuLink"
  WinShell::UninstShortcut "$$desktopLink"

  Delete "$startMenuLink"
  Delete "$desktopLink"

  # delete the installed files
  RMDir /r $INSTDIR

  !insertmacro MULTIUSER_RegistryRemoveInstallInfo

  !ifdef ONE_CLICK
    # strange, AutoCloseWindow=true doesn't work for uninstaller, so, just quit
    Quit
  !endif
SectionEnd