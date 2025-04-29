!ifndef nsProcess::FindProcess
    !include "nsProcess.nsh"
!endif

!ifmacrondef customCheckAppRunning
  !include "getProcessInfo.nsh"
  Var pid
!endif

Var CmdPath
Var FindPath
Var PowerShellPath
Var IsPowerShellAvailable

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
      StrCpy $CmdPath "$SYSDIR\cmd.exe"
      StrCpy $FindPath "$SYSDIR\find.exe"
      StrCpy $PowerShellPath "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
      !insertmacro IS_POWERSHELL_AVAILABLE $IsPowerShellAvailable
      !insertmacro _CHECK_APP_RUNNING
    !endif
!macroend

!macro IS_POWERSHELL_AVAILABLE _RETURN
  # Try running PowerShell with a simple command
  nsExec::ExecToStack `"$PowerShellPath" -NoProfile -NonInteractive -Command "exit 0"`
  Pop ${_RETURN}  # Return code (0 = success, other = error)
  
  ${If} ${_RETURN} == 0
    # PowerShell is available, check if it's not blocked by policies
    nsExec::ExecToStack `"$PowerShellPath" -NoProfile -NonInteractive -Command "if ((Get-ExecutionPolicy -Scope Process) -eq 'Restricted') { exit 1 } else { exit 0 }"`
    Pop ${_RETURN}
  ${EndIf}
  
  # For safety, convert any non-zero result to 1
  ${If} ${_RETURN} != 0
    StrCpy ${_RETURN} 1
  ${EndIf}
!macroend

!macro FIND_PROCESS _PATH _FILENAME _RETURN
  ${If} $IsPowerShellAvailable == True
    nsExec::Exec `"$PowerShellPath" -Command "if ((Get-Process | Where-Object {$$_.Path -and $$_.Path.StartsWith('${_PATH}')}).Count -gt 0) { exit 0 } else { exit 1 }"`
    Pop ${_RETURN}
  ${Else}
    !ifdef INSTALL_MODE_PER_ALL_USERS
      ${nsProcess::FindProcess} "${_FILENAME}" ${_RETURN}
    !else
      # find process owned by current user
      nsExec::Exec `"$CmdPath" /c tasklist /fi "USERNAME eq %USERNAME%" /fi "IMAGENAME eq ${_FILENAME}" /fo csv | "$FindPath" "${_FILENAME}"`
      Pop ${_RETURN}
    !endif
  ${EndIf}
!macroend

!macro KILL_PROCESS _PATH _FILENAME
  ${If} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -Command "Get-Process | ?{$$_.Path -and $$_.Path.StartsWith('${_PATH}')} | Stop-Process -Force"`
  ${Else}
    !ifdef INSTALL_MODE_PER_ALL_USERS
      nsExec::Exec `taskkill /im "${_FILENAME}" /fi "PID ne $pid"`
    !else
      nsExec::Exec `"$CmdPath" /c taskkill /im "${_FILENAME}" /fi "PID ne $pid" /fi "USERNAME eq %USERNAME%"`
    !endif
  ${EndIf}
!macroend

!macro _CHECK_APP_RUNNING
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      # allow app to exit without explicit kill
      Sleep 300
    ${endIf}

    !insertmacro FIND_PROCESS "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" $R0
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

      !insertmacro KILL_PROCESS "$INSTDIR" "${APP_EXECUTABLE_FILENAME}"
      # to ensure that files are not "in-use"
      Sleep 300

      # Retry counter
      StrCpy $R1 0

      loop:
        IntOp $R1 $R1 + 1

        !insertmacro FIND_PROCESS "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          # wait to give a chance to exit gracefully
          Sleep 1000
          !insertmacro KILL_PROCESS "$INSTDIR" "${APP_EXECUTABLE_FILENAME}"
          !insertmacro FIND_PROCESS "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" $R0
          ${If} $R0 == 0
            DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
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
