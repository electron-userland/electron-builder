!include "nsProcess.nsh"

!ifmacrondef customCheckAppRunning
  !include "getProcessInfo.nsh"
  Var pid
!endif

# http://nsis.sourceforge.net/Allow_only_one_installer_instance
!macro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
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

!macro CHECK_APP_RUNNING
    !ifmacrodef customCheckAppRunning
      !insertmacro customCheckAppRunning
    !else
      !insertmacro _CHECK_APP_RUNNING
    !endif
!macroend

!macro _CHECK_APP_RUNNING
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      # allow app to exit without explicit kill
      Sleep 300
    ${endIf}

    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${if} ${isUpdated}
        # allow app to exit without explicit kill
        Sleep 1000
        Goto doStopProcess
      ${endIf}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK doStopProcess
      Quit

      doStopProcess:

      DetailPrint `Closing running "${PRODUCT_NAME}"...`

      # https://github.com/electron-userland/electron-builder/issues/2516#issuecomment-372009092
      nsExec::Exec `taskkill /im "${APP_EXECUTABLE_FILENAME}" /fi "PID ne $pid"` $R0
      # to ensure that files are not "in-use"
      Sleep 300

      # Retry counter
      StrCpy $R1 0

      loop:
        IntOp $R1 $R1 + 1

        ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          # wait to give a chance to exit gracefully
          Sleep 1000
          nsExec::Exec `taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "PID ne $pid"` $R0
          ${If} $R0 != 0
            DetailPrint `Waiting for "${PRODUCT_NAME}" to close (taskkill exit code $R0).`
            Sleep 2000
          ${else}
            Goto not_running
          ${endIf}
        ${else}
          Goto not_running
        ${endIf}

        # App likely running with elevated permissions.
        # Ask user to close it manually
        ${if} $R1 > 1
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY loop
          Quit
        ${else}
          Goto loop
        ${endIf}
      not_running:
    ${endIf}
  ${endIf}
!macroend
