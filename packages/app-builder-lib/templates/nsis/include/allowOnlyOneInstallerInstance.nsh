!ifndef nsProcess::FindProcess
    !include "nsProcess.nsh"
!endif

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
  Var /GLOBAL CmdPath
  Var /GLOBAL FindPath
  Var /GLOBAL PowerShellPath
  StrCpy $CmdPath "$SYSDIR\cmd.exe"
  StrCpy $FindPath "$SYSDIR\find.exe"
  StrCpy $PowerShellPath "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  !ifmacrodef customCheckAppRunning
    !insertmacro customCheckAppRunning
  !else
    !insertmacro IS_POWERSHELL_AVAILABLE
    !insertmacro _CHECK_APP_RUNNING
  !endif
!macroend

!macro IS_POWERSHELL_AVAILABLE
  Var /GLOBAL IsPowerShellAvailable ; 0 = available, 1 = not available
  # Try running PowerShell with a simple command to check if it's available
  nsExec::Exec `"$PowerShellPath" -C "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`
  Pop $0  # Return code (0 = success, other = error)

  ${if} $0 == 0
    # PowerShell is available, check if it's not blocked by policies
    nsExec::Exec `"$PowerShellPath" -C "if ((Get-ExecutionPolicy -Scope Process) -eq 'Restricted') { exit 1 } else { exit 0 }"`
    Pop $0
  ${endIf}

  ${if} $0 != 0
    StrCpy $0 1
  ${endIf}

  StrCpy $IsPowerShellAvailable $0
!macroend

!macro FIND_PROCESS _FILE _RETURN
  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
    Pop ${_RETURN}
  ${else}
    !ifdef INSTALL_MODE_PER_ALL_USERS
      ${nsProcess::FindProcess} "${_FILE}" ${_RETURN}
    !else
      # find process owned by current user
      nsExec::Exec `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${_FILE}" /FO CSV | "$FindPath" "${_FILE}"`
      Pop ${_RETURN}
    !endif
  ${endIf}
!macroend

!macro KILL_PROCESS _FILE _FORCE
  Push $0
  ${if} ${_FORCE} == 1
    ${if} $IsPowerShellAvailable == 0
      StrCpy $0 "-Force"
    ${else}
      StrCpy $0 "/F"
    ${endIf}
  ${else}
    StrCpy $0 ""
  ${endIf}

  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }"`
  ${else}
    !ifdef INSTALL_MODE_PER_ALL_USERS
      nsExec::Exec `taskkill /IM "${_FILE}" /FI "PID ne $pid"`
    !else
      nsExec::Exec `"$CmdPath" /C taskkill $0 /IM "${_FILE}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
    !endif
  ${endIf}
  Pop $0
!macroend 

!macro _CHECK_APP_RUNNING
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      # allow app to exit without explicit kill
      Sleep 300
    ${endIf}

    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${if} ${isUpdated}
        # allow app to exit without explicit kill
        Sleep 1000
        Goto doStopProcess
      ${endIf}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK doStopProcess
      Quit

      doStopProcess:

      DetailPrint "$(appClosing)"

      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      # to ensure that files are not "in-use"
      Sleep 300

      # Retry counter
      StrCpy $R1 0

      loop:
        IntOp $R1 $R1 + 1

        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          # wait to give a chance to exit gracefully
          Sleep 1000
          !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1 # 1 = force kill
          !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
          ${if} $R0 == 0
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
