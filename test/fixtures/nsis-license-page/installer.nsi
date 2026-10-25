Unicode true
RequestExecutionLevel user
!include MUI2.nsh
!include FileFunc.nsh
!include UAC.nsh

Var inner
Var admin
Var updated
Var result
Var navigation
Var directoryShown
Var outerAccepted
Var customLeaveCalled

; Isolate UAC state and the outer-process read, not the page callbacks under test.
; No real elevation or IPC occurs in the simulated executable.
!ifdef SIMULATE_UAC
  !macroundef UAC_AsUser_GetGlobalVar
  !macro UAC_AsUser_GetGlobalVar var
    StrCpy ${var} $outerAccepted
  !macroend
  !undef UAC_IsInnerInstance
  !define UAC_IsInnerInstance '$inner == 1'
  !undef UAC_IsAdmin
  !define UAC_IsAdmin '$admin == 1'
!endif
!define isUpdated '$updated == 1'
!define PRODUCT_NAME "License page regression"
!define PRODUCT_FILENAME "license-test"
!define VERSION "1.0.0"
!define APP_FILENAME "license-test"
!define INSTALL_MODE_PER_ALL_USERS
!define allowToChangeInstallationDirectory
!include common.nsh

!macro licensePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW licenseShown
  !ifdef MULTILINGUAL
    LicenseLangString MUILicense 1033 "${LICENSE_FILE}"
    LicenseLangString MUILicense 1031 "${LICENSE_FILE}"
    !insertmacro MUI_PAGE_LICENSE "$(MUILicense)"
  !else
    !insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
  !endif
  !define LICENSE_PRE mui.LicensePre_${MUI_UNIQUEID}
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW directoryPageShown
!macroend

!macro customPageAfterChangeDir
  !define DIRECTORY_PRE mui.DirectoryPre_${MUI_UNIQUEID}
!macroend

!macro customFinishPage
!macroend

; User callbacks may already own the generic name and the LEAVE hook.
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE licensePagePre
Function licensePagePre
  StrCpy $customLeaveCalled 1
FunctionEnd

!include assistedInstaller.nsh
!insertmacro MUI_LANGUAGE "English"
!ifdef MULTILINGUAL
  !insertmacro MUI_LANGUAGE "German"
!endif

Function .onInit
  ${GetParameters} $R0
  ${GetOptions} $R0 "--inner=" $inner
  ${GetOptions} $R0 "--admin=" $admin
  ${GetOptions} $R0 "--updated=" $updated
  ${GetOptions} $R0 "--outer-accepted=" $outerAccepted
  ${GetOptions} $R0 "--language=" $LANGUAGE
  ${GetOptions} $R0 "--page=" $R1
  StrCpy $INSTDIR "$EXEDIR\license-test"
  ${If} $R1 == "navigation"
    StrCpy $navigation 1
    StrCpy $directoryShown 0
    FileOpen $result "$EXEDIR\result.txt" w
    FileClose $result
    Return
  ${EndIf}

  ; Abort in a pre callback exits .onInit before the second marker is written.
  ; Call the actual MUI pre functions so a missing or miswired hook fails too.
  FileOpen $result "$EXEDIR\result.txt" w
  FileWrite $result "skipped"
  FileClose $result
  SetErrorLevel 0
  ${If} $R1 == "license"
    Call ${LICENSE_PRE}
  ${Else}
    Call ${DIRECTORY_PRE}
  ${EndIf}
  FileOpen $result "$EXEDIR\result.txt" w
  FileWrite $result "shown"
  FileClose $result
  Quit
FunctionEnd

; Drive the actual NSIS page loop, not repeated Calls from .onInit (Abort
; unwinds that callback). WM_COMMAND/IDC_BACK follows NSIS's normal Back path.
; Post rather than Send so the current SHOW callback can finish first.
Function licenseShown
  FileOpen $result "$EXEDIR\result.txt" a
  FileSeek $result 0 END
  FileWrite $result "license$\r$\n"
  FileClose $result
  System::Call 'user32::PostMessage(p $HWNDPARENT, i ${WM_COMMAND}, p 1, p 0)' ; IDOK / Next
FunctionEnd

Function directoryPageShown
  FileOpen $result "$EXEDIR\result.txt" a
  FileSeek $result 0 END
  ${If} $inner == 0
    FileWrite $result "accepted=$isAssistedLicenseAccepted,customLeave=$customLeaveCalled$\r$\n"
  ${EndIf}
  FileWrite $result "directory$\r$\n"
  FileClose $result
  ${If} $directoryShown == 0
    StrCpy $directoryShown 1
    System::Call 'user32::PostMessage(p $HWNDPARENT, i ${WM_COMMAND}, p 3, p 0)' ; IDC_BACK
  ${Else}
    SetErrorLevel 0
    Quit ; Never advance to installation.
  ${EndIf}
FunctionEnd

Function .onGUIEnd
  ${If} $navigation == 1
    FileOpen $result "$EXEDIR\result.txt" a
    FileSeek $result 0 END
    FileWrite $result "closed$\r$\n"
    FileClose $result
  ${EndIf}
FunctionEnd

Section
  ; Safety net: the navigation test must never reach the install section.
  FileOpen $result "$EXEDIR\result.txt" a
  FileSeek $result 0 END
  FileWrite $result "unexpected-install$\r$\n"
  FileClose $result
  Quit
SectionEnd
