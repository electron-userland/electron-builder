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