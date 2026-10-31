!include FileFunc.nsh
!include UAC.nsh
!include WordFunc.nsh

!define FOLDERID_UserProgramFiles {5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}
!define KF_FLAG_CREATE 0x00008000

# allow user to define own custom
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

# current Install Mode ("all" or "CurrentUser")
Var installMode

!ifndef INSTALL_MODE_PER_ALL_USERS
  !ifndef ONE_CLICK
    Var hasPerUserInstallation
    Var hasPerMachineInstallation
  !endif
  Var PerUserInstallationFolder

  !macro setInstallModePerUser
    StrCpy $installMode CurrentUser
    SetShellVarContext current

    # сhecks registry for previous installation path
    ReadRegStr $perUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    # a double quote is invalid in a path: drop the closing quote that an earlier installer kept from a quoted /D= argument
    ${WordReplace} $perUserInstallationFolder '"' "" "+" $perUserInstallationFolder
    ${if} $perUserInstallationFolder != ""
      StrCpy $INSTDIR $perUserInstallationFolder
    ${else}
      StrCpy $0 "$LocalAppData\Programs"

      Push $1
      Push $2
      # UserProgramFiles is the per-user install root and can be a non-default location
      StrCpy $2 0
      System::Call 'SHELL32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'
      ${If} $1 == 0
        System::Call 'KERNEL32::lstrcpynW(w .r0, p r2, i ${NSIS_MAX_STRLEN})p'
      ${endif}
      # SHGetKnownFolderPath may return allocated memory even on failure
      ${If} $2 != 0
        System::Call 'OLE32::CoTaskMemFree(p r2)'
      ${endif}
      Pop $2
      Pop $1

      StrCpy $INSTDIR "$0\${APP_FILENAME}"
    ${endif}

    # allow /D switch to override installation path https://github.com/electron-userland/electron-builder/issues/1551
    !insertmacro GetDParameter $R0
    ${If} $R0 != ""
      StrCpy $INSTDIR $R0
    ${endif}

  !macroend
!endif

!ifdef INSTALL_MODE_PER_ALL_USERS_REQUIRED
  Var perMachineInstallationFolder

  !macro setInstallModePerAllUsers
    StrCpy $installMode all
    SetShellVarContext all

    # сheck registry for previous installation path
    ReadRegStr $perMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    # a double quote is invalid in a path: drop the closing quote that an earlier installer kept from a quoted /D= argument
    ${WordReplace} $perMachineInstallationFolder '"' "" "+" $perMachineInstallationFolder
    ${if} $perMachineInstallationFolder != ""
      StrCpy $INSTDIR $perMachineInstallationFolder
    ${else}
      StrCpy $0 "$PROGRAMFILES"
      !ifdef APP_64
        ${if} ${RunningX64}
          StrCpy $0 "$PROGRAMFILES64"
        ${endif}
      !endif

      !ifdef MENU_FILENAME
        StrCpy $0 "$0\${MENU_FILENAME}"
      !endif

      StrCpy $INSTDIR "$0\${APP_FILENAME}"
    ${endif}

    !ifdef BUILD_UNINSTALLER
      ${ifNot} ${UAC_IsAdmin}
        ${if} ${Silent}
          # A silent uninstall reaching here is driven by installSection.nsh's
          # uninstallOldVersion -- the same silent-update path installer.nsi's own
          # elevation check (Section "install") was made ACL-aware for. Mirror that
          # reasoning here: this uninstall section deletes $INSTDIR (RMDir /r),
          # INSTALL_REGISTRY_KEY and UNINSTALL_REGISTRY_KEY[_2] (DeleteRegKey), and the
          # Start Menu/desktop shortcut locations (RMDir/Delete), all under the same
          # all-users SHELL_CONTEXT -- and all of those fail silently when unelevated.
          # Only elevate if a live check shows at least one of them still needs it.
          # Interactive (non-silent) uninstalls keep the original unconditional
          # elevate -- that's a visible, explicit user action, not what this is about.
          !insertmacro IsDirWritable $INSTDIR $R7
          !insertmacro IsRegKeyWritable HKLM "${INSTALL_REGISTRY_KEY}" $R8
          !insertmacro IsRegKeyWritable HKLM "${UNINSTALL_REGISTRY_KEY}" $R6
          StrCpy $R5 "1"
          !ifdef UNINSTALL_REGISTRY_KEY_2
            !insertmacro IsRegKeyWritable HKLM "${UNINSTALL_REGISTRY_KEY_2}" $R5
          !endif
          StrCpy $R4 "1"
          !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
            !insertmacro IsDirWritable $SMPROGRAMS $R4
          !endif
          StrCpy $R3 "1"
          !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
            !insertmacro IsDirWritable $DESKTOP $R3
          !endif
          ${if} $R7 == "0"
          ${orIf} $R8 == "0"
          ${orIf} $R6 == "0"
          ${orIf} $R5 == "0"
          ${orIf} $R4 == "0"
          ${orIf} $R3 == "0"
            ShowWindow $HWNDPARENT ${SW_HIDE}
            !insertmacro UAC_RunElevated
            Quit
          ${endif}
        ${else}
          ShowWindow $HWNDPARENT ${SW_HIDE}
          !insertmacro UAC_RunElevated
          Quit
        ${endif}
      ${endif}
    !endif

    # allow /D switch to override installation path https://github.com/electron-userland/electron-builder/issues/1551
    !insertmacro GetDParameter $R0
    ${If} $R0 != ""
      StrCpy $INSTDIR $R0
    ${endif}

  !macroend
!endif

# Custom function to handle /D parameter with spaces
# The /D parameter is special in NSIS - it must be the last parameter and is not quoted: /S /D=C:\Program Files\App
# Use StdUtils.GetAllParameters to get the full command line, then parse /D= manually
# A caller that quotes the whole argument ("/D=C:\Program Files\App", as child_process.spawn does for a path with a space)
# leaves the closing quote in the rest of the command line, so the parsed argument is used for that form
!macro GetDParameter outVar
  Push $R8
  Push $R9
  Push $R7
  Push $R6
  Push $R5

  # Get the complete command line using StdUtils (including /D parameter)
  ${StdUtils.GetAllParameters} $R8 "0"

  # Initialize result
  StrCpy $R9 ""

  # Search for /D= or /d= using a simple loop
  StrLen $R7 $R8
  IntOp $R7 $R7 - 2  # Don't check last 2 characters
  StrCpy $R6 0

  ${Do}
    StrCpy $R5 $R8 3 $R6  # Get 3 characters starting at position $R6
    ${If} $R5 == "/D="
    ${OrIf} $R5 == "/d="
      # the character before /D= tells whether the caller quoted the argument
      StrCpy $R7 ""
      ${If} $R6 > 0
        IntOp $R7 $R6 - 1
        StrCpy $R7 $R8 1 $R7
      ${EndIf}
      ${If} $R7 == '"'
        # quoted: the rest of the command line ends with the closing quote, take the parsed argument instead
        ${StdUtils.GetParameter} $R9 "D" ""
      ${Else}
        # Found /D= or /d=, extract everything after it
        IntOp $R6 $R6 + 3
        StrCpy $R9 $R8 "" $R6
      ${EndIf}
      ${Break}
    ${EndIf}
    IntOp $R6 $R6 + 1
  ${LoopUntil} $R6 > $R7

  StrCpy ${outVar} $R9
  Pop $R5
  Pop $R6
  Pop $R7
  Pop $R9
  Pop $R8
!macroend