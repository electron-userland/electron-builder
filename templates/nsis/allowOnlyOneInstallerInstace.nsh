!include "nsProcess.nsh"

# http://nsis.sourceforge.net/Allow_only_one_installer_instance
!macro ALLOW_ONLY_ONE_INSTALLER_INSTACE
  BringToFront
  !define /ifndef SYSTYPE_PTR p ; NSIS v3.0+
  System::Call 'kernel32::CreateMutex(${SYSTYPE_PTR}0, i1, t"${APP_GUID}")?e'
  Pop $0
  IntCmpU $0 183 0 launch launch ; ERROR_ALREADY_EXISTS
    StrLen $0 "$(^SetupCaption)"
    IntOp $0 $0 + 1 ; GetWindowText count includes \0
    StrCpy $1 "" ; Start FindWindow with NULL
    loop:
      FindWindow $1 "#32770" "" "" $1
      StrCmp 0 $1 notfound
      System::Call 'user32::GetWindowText(${SYSTYPE_PTR}r1, t.r2, ir0)'
      StrCmp $2 "$(^SetupCaption)" 0 loop
      SendMessage $1 0x112 0xF120 0 /TIMEOUT=2000 ; WM_SYSCOMMAND:SC_RESTORE to restore the window if it is minimized
      System::Call "user32::SetForegroundWindow(${SYSTYPE_PTR}r1)"
    notfound:
      Abort
  launch:
!macroend

!macro CHECK_APP_RUNNING MODE
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} is running. $\r$\nClick OK to close it and continue with ${MODE}." /SD IDOK IDOK doStopProcess
      Quit
      doStopProcess:
        DetailPrint "Closing running ${PRODUCT_NAME} ..."
        ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        DetailPrint "Waiting for ${PRODUCT_NAME} to close."
        Sleep 2000
  ${EndIf}
  ${nsProcess::Unload}
!macroend