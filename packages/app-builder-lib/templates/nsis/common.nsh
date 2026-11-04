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
    MessageBox MB_OK "$(win7Required)" /SD IDOK
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
          MessageBox MB_OK|MB_ICONEXCLAMATION "$(x64WinRequired)" /SD IDOK
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

# nsis.allowUnelevatedPerMachineUpdate: only an assisted installer that also offers a per-user installation elevates for a silent update
# of a per-machine installation (a one-click or perMachine installer is per-machine from the start)
!ifdef ALLOW_UNELEVATED_PER_MACHINE_UPDATE
  !ifndef ONE_CLICK
    !ifndef INSTALL_MODE_PER_ALL_USERS
      !define UNELEVATED_PER_MACHINE_UPDATE
    !endif
  !endif
!endif

!ifdef UNELEVATED_PER_MACHINE_UPDATE
  # "1" when checkUnelevatedPerMachineUpdate found every right the update needs
  Var unelevatedAccess

  # FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY | FILE_DELETE_CHILD | DELETE: the update removes the folder and its contents and re-creates them
  !define UNELEVATED_DIR_ACCESS 0x10046
  # FILE_ADD_SUBDIRECTORY: the removed folder is re-created in its parent
  !define UNELEVATED_PARENT_DIR_ACCESS 0x4
  # FILE_ADD_FILE | FILE_DELETE_CHILD: shortcuts are replaced in the folder
  !define UNELEVATED_SHORTCUT_DIR_ACCESS 0x42
  # GENERIC_WRITE | DELETE: an existing file is overwritten or deleted, which needs more than creating a new one
  !define UNELEVATED_FILE_ACCESS 0x40010000
  # KEY_QUERY_VALUE | KEY_SET_VALUE | KEY_CREATE_SUB_KEY | KEY_ENUMERATE_SUB_KEYS | DELETE: the key is deleted (DeleteRegKey) and written
  !define UNELEVATED_REG_KEY_ACCESS 0x1000F
  # KEY_CREATE_SUB_KEY: the deleted key is re-created under its parent
  !define UNELEVATED_PARENT_REG_KEY_ACCESS 0x4

  # Clears $unelevatedAccess unless this process can open the existing file or folder with the access. Nothing is created or changed.
  # Uses $0.
  !macro unelevatedProbeFile _PATH _ACCESS
    # FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS (needed to open a folder)
    System::Call 'kernel32::CreateFileW(w "${_PATH}", i ${_ACCESS}, i 7, p 0, i 3, i 0x02000000, p 0) p.r0'
    ${if} $0 = -1
      StrCpy $unelevatedAccess "0"
    ${else}
      System::Call 'kernel32::CloseHandle(p r0)'
    ${endif}
  !macroend

  # Clears $unelevatedAccess unless this process can open the HKLM key with the access, in the registry view check64BitAndSetRegView
  # selected. With _OPTIONAL "1", a missing key passes (deleting it is a no-op). Nothing is created or changed. Uses $0 and $1.
  !macro unelevatedProbeRegKey _KEY _ACCESS _OPTIONAL
    IntOp $1 ${_ACCESS} + 0
    !ifdef APP_ARM64
      ${if} ${RunningX64}
      ${orIf} ${IsNativeARM64}
        # KEY_WOW64_64KEY
        IntOp $1 $1 | 0x100
      ${endif}
    !else
      !ifdef APP_64
        ${if} ${RunningX64}
          IntOp $1 $1 | 0x100
        ${endif}
      !endif
    !endif
    System::Call 'advapi32::RegOpenKeyExW(p 0x80000002, w "${_KEY}", i 0, i r1, *p .r1) i.r0'
    ${if} $0 = 0
      System::Call 'advapi32::RegCloseKey(p r1)'
    ${elseIf} $0 = 2 # ERROR_FILE_NOT_FOUND
    ${andIf} "${_OPTIONAL}" == "1"
      # nothing to delete
    ${else}
      StrCpy $unelevatedAccess "0"
    ${endif}
  !macroend

  # Sets $unelevatedAccess to "1" when a silent update (--updated) of the per-machine installation in $INSTDIR can skip elevation: no
  # per-user installation exists, and this process already holds every right the update uses. The update runs the old uninstaller, which
  # removes $INSTDIR, the HKLM keys and the all-users shortcuts, and then re-creates them, so the rights to re-create them in their parents
  # are needed too. Only probes: nothing is created or changed. Saves and restores the registers it uses.
  !macro checkUnelevatedPerMachineUpdate
    Push $0
    Push $1
    Push $2
    StrCpy $unelevatedAccess "0"

    ${if} ${Silent}
    ${andIf} ${isUpdated}
    ${andIf} $installMode == "all"
      # with a per-user installation too, the installer elevates and moves the per-user installation to per-machine
      ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${if} $0 == ""
        StrCpy $unelevatedAccess "1"
      ${endif}
    ${endif}

    ${if} $unelevatedAccess == "1"
      !insertmacro unelevatedProbeFile "$INSTDIR" ${UNELEVATED_DIR_ACCESS}
      !insertmacro unelevatedProbeFile "$INSTDIR\${APP_EXECUTABLE_FILENAME}" ${UNELEVATED_FILE_ACCESS}
      ${GetParent} "$INSTDIR" $2
      !insertmacro unelevatedProbeFile "$2" ${UNELEVATED_PARENT_DIR_ACCESS}

      !insertmacro unelevatedProbeRegKey "${INSTALL_REGISTRY_KEY}" ${UNELEVATED_REG_KEY_ACCESS} "0"
      ${GetParent} "${INSTALL_REGISTRY_KEY}" $2
      !insertmacro unelevatedProbeRegKey "$2" ${UNELEVATED_PARENT_REG_KEY_ACCESS} "0"
      !insertmacro unelevatedProbeRegKey "${UNINSTALL_REGISTRY_KEY}" ${UNELEVATED_REG_KEY_ACCESS} "0"
      ${GetParent} "${UNINSTALL_REGISTRY_KEY}" $2
      !insertmacro unelevatedProbeRegKey "$2" ${UNELEVATED_PARENT_REG_KEY_ACCESS} "0"
      !ifdef UNINSTALL_REGISTRY_KEY_2
        !insertmacro unelevatedProbeRegKey "${UNINSTALL_REGISTRY_KEY_2}" ${UNELEVATED_REG_KEY_ACCESS} "1"
      !endif

      # SetShellVarContext all: the all-users Start Menu and Public Desktop
      !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
        !ifdef MENU_FILENAME
          StrCpy $2 "$SMPROGRAMS\${MENU_FILENAME}"
        !else
          StrCpy $2 "$SMPROGRAMS"
        !endif
        !insertmacro unelevatedProbeFile "$2" ${UNELEVATED_SHORTCUT_DIR_ACCESS}
        ${if} ${FileExists} "$2\${SHORTCUT_NAME}.lnk"
          !insertmacro unelevatedProbeFile "$2\${SHORTCUT_NAME}.lnk" ${UNELEVATED_FILE_ACCESS}
        ${endif}
      !endif
      !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
        !insertmacro unelevatedProbeFile "$DESKTOP" ${UNELEVATED_SHORTCUT_DIR_ACCESS}
        ${if} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
          !insertmacro unelevatedProbeFile "$DESKTOP\${SHORTCUT_NAME}.lnk" ${UNELEVATED_FILE_ACCESS}
        ${endif}
      !endif
    ${endif}

    Pop $2
    Pop $1
    Pop $0
  !macroend
!endif
