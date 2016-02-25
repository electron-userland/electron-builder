!define APP_NAME "<%= name %>"
!define APP_VERSION "<%= version %>"
!define APP_PUBLISHER "<%= publisher %>"

!define APP_DIR "${APP_NAME}"
!define APP_OUT_FILE "<%= outFile %>"

Name "${APP_NAME}"

!include "MUI2.nsh"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

!addplugindir .
!include "nsProcess.nsh"
!include "FileFunc.nsh"

<% if(fileAssociation){ %>
# include file association script
!include "FileAssociation.nsh"
<% } %>

BrandingText "${APP_NAME} ${APP_VERSION}"

# define the resulting installer's name
OutFile "${APP_OUT_FILE}"

# set the installation directory
InstallDir "$PROGRAMFILES\${APP_NAME}\"

# app dialogs
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN_TEXT "Start ${APP_NAME}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_NAME}.exe"

!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

!macro CheckAppRunning MODE
  ${nsProcess::FindProcess} "${APP_NAME}.exe" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "${APP_NAME} is running. $\r$\nClick OK to close it and continue with ${MODE}." /SD IDCANCEL IDOK doStopProcess
      Abort
      doStopProcess:
           DetailPrint "Closing running ${APP_NAME} ..."
           ${nsProcess::KillProcess} "${APP_NAME}.exe" $R0
           DetailPrint "Waiting for ${APP_NAME} to close."
           Sleep 2000
  ${EndIf}
  ${nsProcess::Unload}
!macroend

# default section start
Section
  SetShellVarContext all

  !insertmacro CheckAppRunning "install"
  # delete the installed files
  RMDir /r $INSTDIR

  # define the path to which the installer should install
  SetOutPath $INSTDIR

  # specify the files to go in the output path
  File /r "<%= appPath %>\*"

  # specify icon to go in the output path
  File "icon.ico"

  <% if(fileAssociation){ %>
    # specify file association
    ${registerExtension} "$INSTDIR\${APP_NAME}.exe" "<%= fileAssociation.extension %>" "<%= fileAssociation.fileType %>"
  <% } %>

  # create the uninstaller
  WriteUninstaller "$INSTDIR\Uninstall ${APP_NAME}.exe"

  # create shortcuts in the start menu and on the desktop
  CreateDirectory "$SMPROGRAMS\${APP_DIR}"
  CreateShortCut "$SMPROGRAMS\${APP_DIR}\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"
  CreateShortCut "$SMPROGRAMS\${APP_DIR}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall ${APP_NAME}.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe" "" "$INSTDIR\icon.ico"

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "UninstallString" "$INSTDIR\Uninstall ${APP_NAME}.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "Publisher" "${APP_PUBLISHER}"

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
                   "EstimatedSize" "$0"

SectionEnd

# create a section to define what the uninstaller does
Section "Uninstall"

  !insertmacro CheckAppRunning "uninstall"

  SetShellVarContext all

  # delete the installed files
  RMDir /r $INSTDIR

  # delete the shortcuts
  delete "$SMPROGRAMS\${APP_DIR}\${APP_NAME}.lnk"
  delete "$SMPROGRAMS\${APP_DIR}\Uninstall ${APP_NAME}.lnk"
  rmDir  "$SMPROGRAMS\${APP_DIR}"
  delete "$DESKTOP\${APP_NAME}.lnk"


  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
