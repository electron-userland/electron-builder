!include x64.nsh
!include WinVer.nsh

BrandingText "${PRODUCT_NAME} ${VERSION}"
ShowInstDetails nevershow
!ifdef BUILD_UNINSTALLER
  ShowUninstDetails nevershow
!endif
FileBufSize 64

# Allows for a product name to display properly if it has an ampersand
# Doesn't affect anything if there is no double ampersand
!searchreplace DoubleAmpersand "${PRODUCT_NAME}" "&" "&&"
Name "${PRODUCT_NAME}" "${DoubleAmpersand}"

!define APP_EXECUTABLE_FILENAME "${PRODUCT_FILENAME}.exe"
!define UNINSTALL_FILENAME "Uninstall ${PRODUCT_FILENAME}.exe"

!macro setSpaceRequired SECTION_ID
  !ifdef APP_64_UNPACKED_SIZE
    !ifdef APP_32_UNPACKED_SIZE
      !ifdef APP_ARM64_UNPACKED_SIZE
        ${if} ${IsNativeARM64}
          SectionSetSize ${SECTION_ID} ${APP_ARM64_UNPACKED_SIZE}
        ${elseif} ${IsNativeAMD64}
          SectionSetSize ${SECTION_ID} ${APP_64_UNPACKED_SIZE}
        ${else}
          SectionSetSize ${SECTION_ID} ${APP_32_UNPACKED_SIZE}
        ${endif}
      !else
        ${if} ${RunningX64}
          SectionSetSize ${SECTION_ID} ${APP_64_UNPACKED_SIZE}
        ${else}
          SectionSetSize ${SECTION_ID} ${APP_32_UNPACKED_SIZE}
        ${endif}
      !endif
    !else
      SectionSetSize ${SECTION_ID} ${APP_64_UNPACKED_SIZE}
    !endif
  !else
    !ifdef APP_32_UNPACKED_SIZE
      SectionSetSize ${SECTION_ID} ${APP_32_UNPACKED_SIZE}
    !endif
  !endif
!macroend

!macro check64BitAndSetRegView
  # https://github.com/electron-userland/electron-builder/issues/2420
  ${If} ${IsWin2000}
  ${OrIf} ${IsWinME}
  ${OrIf} ${IsWinXP}
  ${OrIf} ${IsWinVista}
    MessageBox MB_OK "$(win7Required)"
    Quit
  ${EndIf}

  !ifdef APP_ARM64
    ${If} ${RunningX64}
      SetRegView 64
    ${EndIf}
    ${If} ${IsNativeARM64}
      SetRegView 64
    ${EndIf}
  !else
    !ifdef APP_64
      ${If} ${RunningX64}
        SetRegView 64
      ${Else}
        !ifndef APP_32
          MessageBox MB_OK|MB_ICONEXCLAMATION "$(x64WinRequired)"
          Quit
        !endif
      ${EndIf}
    !endif
  !endif
!macroend

# avoid exit code 2
!macro quitSuccess
  SetErrorLevel 0
  Quit
!macroend

!macro setLinkVars
  # old desktop shortcut (could exist or not since the user might has selected to delete it)
  ReadRegStr $oldShortcutName SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" ShortcutName
  ${if} $oldShortcutName == ""
    StrCpy $oldShortcutName "${PRODUCT_FILENAME}"
  ${endIf}
  StrCpy $oldDesktopLink "$DESKTOP\$oldShortcutName.lnk"

  # new desktop shortcut (will be created/renamed in case of a fresh installation or if the user haven't deleted the initial one)
  StrCpy $newDesktopLink "$DESKTOP\${SHORTCUT_NAME}.lnk"

  ReadRegStr $oldMenuDirectory SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
  ${if} $oldMenuDirectory == ""
    StrCpy $oldStartMenuLink "$SMPROGRAMS\$oldShortcutName.lnk"
  ${else}
    StrCpy $oldStartMenuLink "$SMPROGRAMS\$oldMenuDirectory\$oldShortcutName.lnk"
  ${endIf}

  # new menu shortcut (will be created/renamed in case of a fresh installation or if the user haven't deleted the initial one)
  !ifdef MENU_FILENAME
    StrCpy $newStartMenuLink "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
  !else
    StrCpy $newStartMenuLink "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !endif
!macroend

!macro skipPageIfUpdated
  !define UniqueID ${__LINE__}

  Function skipPageIfUpdated_${UniqueID}
    ${if} ${isUpdated}
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE skipPageIfUpdated_${UniqueID}
  !undef UniqueID
!macroend

!macro StartApp
  Var /GLOBAL startAppArgs
  ${if} ${isUpdated}
    StrCpy $startAppArgs "--updated"
  ${else}
    StrCpy $startAppArgs ""
  ${endif}

  ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$startAppArgs"
!macroend

!define LogSet "!insertmacro LogSetMacro"
!macro LogSetMacro SETTING
  !ifdef ENABLE_LOGGING_ELECTRON_BUILDER
    SetOutPath $INSTDIR
    LogSet ${SETTING}
  !endif
!macroend

!define LogText "!insertmacro LogTextMacroEB"
!macro LogTextMacroEB INPUT_TEXT
  !ifdef ENABLE_LOGGING_ELECTRON_BUILDER
    LogText ${INPUT_TEXT}
  !endif
!macroend

# Live check for whether the current (possibly unelevated) process can actually write to
# a directory, rather than relying solely on the persisted "was this a per-machine
# install" registry flag. A per-machine-flagged install doesn't necessarily still need
# elevation to write to its own folder -- e.g. an installer's customInstall hook may have
# already loosened that folder's ACL for the current user. Attempts to create and remove
# a marker file; leaves _RESULT_VAR as "1" if that succeeds, "0" otherwise.
!macro IsDirWritable _DIR _RESULT_VAR
  Push $R9
  ClearErrors
  FileOpen $R9 "${_DIR}\.eb-write-test.tmp" w
  ${if} ${Errors}
    StrCpy ${_RESULT_VAR} "0"
  ${else}
    FileClose $R9
    Delete "${_DIR}\.eb-write-test.tmp"
    StrCpy ${_RESULT_VAR} "1"
  ${endif}
  Pop $R9
!macroend

# Companion to IsDirWritable: the install section also writes its per-machine
# registration (registryAddInstallInfo) to SHELL_CONTEXT, which resolves to HKLM when
# installMode is "all". That WriteRegStr fails silently (no error surfaced, no abort)
# when unelevated, which -- combined with uninstallOldVersion deleting the *existing*
# registry key first -- can wipe the InstallLocation value entirely instead of leaving it
# unchanged, corrupting the next launch's per-machine detection. A writability check on
# $INSTDIR alone is therefore not sufficient to safely skip elevation; this must also
# hold for _RESULT_VAR to be trustworthy.
!macro IsRegKeyWritable _ROOT _KEY _RESULT_VAR
  ClearErrors
  WriteRegStr ${_ROOT} "${_KEY}" ".eb-write-test" "1"
  ${if} ${Errors}
    StrCpy ${_RESULT_VAR} "0"
  ${else}
    DeleteRegValue ${_ROOT} "${_KEY}" ".eb-write-test"
    StrCpy ${_RESULT_VAR} "1"
  ${endif}
!macroend
