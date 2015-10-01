!define NAME "<%= name %>"
!define UNINSTKEY "${NAME}" ; Using a GUID here is not a bad idea
!define DEFAULTNORMALDESTINATON "$ProgramFiles\${NAME}"
!define DEFAULTPORTABLEDESTINATON "$Desktop\${NAME}"
Name "${NAME}"
Outfile "${NAME} Setup.exe"
RequestExecutionlevel highest
SetCompressor LZMA

Var NormalDestDir
Var PortableDestDir
Var PortableMode

!include LogicLib.nsh
!include FileFunc.nsh
!include MUI2.nsh
!include x64.nsh

!insertmacro MUI_PAGE_WELCOME
Page Custom PortableModePageCreate PortableModePageLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN_TEXT "Start ${NAME}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${NAME}.exe"

!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE English

Function .onInit
    StrCpy $NormalDestDir "${DEFAULTNORMALDESTINATON}"
    StrCpy $PortableDestDir "${DEFAULTPORTABLEDESTINATON}"

    # set the installation directory
    ${If} ${RunningX64}
      StrCpy $NormalDestDir "$PROGRAMFILES64\${APP_NAME}\"
    ${Else}
      StrCpy $NormalDestDir "$PROGRAMFILES\${APP_NAME}\"
    ${EndIf}

    ${GetParameters} $9

    ClearErrors
    ${GetOptions} $9 "/?" $8
    ${IfNot} ${Errors}
        MessageBox MB_ICONINFORMATION|MB_SETFOREGROUND "\
          /PORTABLE : Extract application to USB drive etc$\n\
          /S : Silent install$\n\
          /D=%directory% : Specify destination directory$\n"
        Quit
    ${EndIf}

    ClearErrors
    ${GetOptions} $9 "/PORTABLE" $8
    ${IfNot} ${Errors}
        StrCpy $PortableMode 1
        StrCpy $0 $PortableDestDir
    ${Else}
        StrCpy $PortableMode 0
        StrCpy $0 $NormalDestDir
        ${If} ${Silent}
            Call RequireAdmin
        ${EndIf}
    ${EndIf}

    ${If} $InstDir == ""
        ; User did not use /D to specify a directory, 
        ; we need to set a default based on the install mode
        StrCpy $InstDir $0
    ${EndIf}
    Call SetModeDestinationFromInstdir
FunctionEnd


Function RequireAdmin
    UserInfo::GetAccountType
    Pop $8
    ${If} $8 != "admin"
        MessageBox MB_ICONSTOP "You need administrator rights to install ${NAME}"
        SetErrorLevel 740 ;ERROR_ELEVATION_REQUIRED
        Abort
    ${EndIf}
FunctionEnd


Function SetModeDestinationFromInstdir
    ${If} $PortableMode = 0
        StrCpy $NormalDestDir $InstDir
    ${Else}
        StrCpy $PortableDestDir $InstDir
    ${EndIf}
FunctionEnd


Function PortableModePageCreate
    Call SetModeDestinationFromInstdir ; If the user clicks BACK on the directory page we will remember their mode specific directory
    !insertmacro MUI_HEADER_TEXT "Install Mode" "Choose how you want to install ${NAME}."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 10u 100% 24u "Select install mode:"
    Pop $0
    ${NSD_CreateRadioButton} 30u 50u -30u 8u "Normal install"
    Pop $1
    ${NSD_CreateRadioButton} 30u 70u -30u 8u "Portable"
    Pop $2
    ${If} $PortableMode = 0
        SendMessage $1 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
        SendMessage $2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}
    nsDialogs::Show
FunctionEnd

Function PortableModePageLeave
    ${NSD_GetState} $1 $0
    ${If} $0 <> ${BST_UNCHECKED}
        StrCpy $PortableMode 0
        StrCpy $InstDir $NormalDestDir
        Call RequireAdmin
    ${Else}
        StrCpy $PortableMode 1
        StrCpy $InstDir $PortableDestDir
    ${EndIf}
FunctionEnd



Section
    SetOutPath "$InstDir"
    ;File "source\${NAME}.exe"

    ${If} $PortableMode = 0
        WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTKEY}" "DisplayName" "${NAME}"
        WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall ${NAME}.exe"'
        WriteUninstaller "$INSTDIR\Uninstall ${NAME}.exe"
    ${Else}
        ; Create the file the application uses to detect portable mode
        FileOpen $0 "$INSTDIR\portable.dat" w
        FileWrite $0 "PORTABLE"
        FileClose $0
    ${EndIf}
SectionEnd


Section Uninstall
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTKEY}"
    Delete "$INSTDIR\Uninstall ${NAME}.exe"
    ;Delete "$INSTDIR\${NAME}.exe"
    RMDir "$InstDir"
SectionEnd