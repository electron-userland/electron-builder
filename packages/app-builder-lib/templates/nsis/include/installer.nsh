# functions (nsis macro) for installer

!include "extractAppPackage.nsh"

!ifdef APP_PACKAGE_URL
  !include webPackage.nsh
!endif

!macro installApplicationFiles
  !ifdef APP_BUILD_DIR
    File /r "${APP_BUILD_DIR}\*.*"
  !else
    !ifdef APP_PACKAGE_URL
      Var /GLOBAL packageFile
      Var /GLOBAL isPackageFileExplicitlySpecified

      ${StdUtils.GetParameter} $packageFile "package-file" ""
      ${if} $packageFile == ""
        !insertmacro selectWebPackage $packageFile $1
        StrCpy $4 "$packageFile"
        StrCpy $packageFile "$EXEDIR/$packageFile"
        StrCpy $isPackageFileExplicitlySpecified "false"
      ${else}
        StrCpy $isPackageFileExplicitlySpecified "true"
      ${endIf}

      # An explicit --package-file (electron-updater passes the package it verified against the update manifest) must match one of the
      # packages built with this installer. Any arch is accepted: electron-updater selects the package by its process arch, this installer
      # by the native machine arch. nsisWeb.allowUnverifiedAppPackage (ALLOW_UNVERIFIED_APP_PACKAGE) skips this for a deliberately foreign
      # package (use case - one installer suitable for any app version).
      ${if} ${FileExists} "$packageFile"
        ${if} $isPackageFileExplicitlySpecified == "true"
          !ifndef ALLOW_UNVERIFIED_APP_PACKAGE
            ${StdUtils.HashFile} $3 "SHA2-512" "$packageFile"
            !ifdef APP_64_HASH
              StrCmp $3 "${APP_64_HASH}" fun_extract
            !endif
            !ifdef APP_32_HASH
              StrCmp $3 "${APP_32_HASH}" fun_extract
            !endif
            !ifdef APP_ARM64_HASH
              StrCmp $3 "${APP_ARM64_HASH}" fun_extract
            !endif
            MessageBox MB_OK|MB_ICONSTOP "Package file $packageFile doesn't match any package of this installer (checksum $3). Installation aborted." /SD IDOK
            SetErrorLevel 2
            Quit
          !endif
          Goto fun_extract
        ${else}
          ${StdUtils.HashFile} $3 "SHA2-512" "$packageFile"
          ${if} $3 == $1
            Goto fun_extract
          ${else}
            MessageBox MB_OK "Package file $4 found locally, but checksum doesn't match — expected $1, actual $3.$\r$\nLocal file is ignored and package will be downloaded from Internet." /SD IDOK
          ${endIf}
        ${endIf}
      ${endIf}

      !insertmacro downloadApplicationFiles

      # A publish-derived (versioned) URL names exactly the package built with this installer: the download must match its hash
      # ($1, set by selectWebPackage in downloadApplicationFiles under the same define). An explicit appPackageUrl (e.g. a
      # version-independent "latest" URL) can serve packages of other builds and is not verified.
      !ifdef APP_PACKAGE_URL_IS_INCOMPLETE
        !ifndef ALLOW_UNVERIFIED_APP_PACKAGE
          ${StdUtils.HashFile} $3 "SHA2-512" "$packageFile"
          ${if} $3 != $1
            MessageBox MB_OK|MB_ICONSTOP "Package downloaded from $packageUrl doesn't match this installer — expected checksum $1, actual $3. Installation aborted." /SD IDOK
            SetErrorLevel 2
            Quit
          ${endIf}
        !endif
      !endif

      fun_extract:
        !insertmacro extractUsing7za "$packageFile"

        # electron always uses per user app data
        ${if} $installMode == "all"
          SetShellVarContext current
        ${endif}

        !insertmacro moveFile "$packageFile" "$LOCALAPPDATA\${APP_PACKAGE_STORE_FILE}"

        ${if} $installMode == "all"
          SetShellVarContext all
        ${endif}
    !else
      !insertmacro extractEmbeddedAppPackage
      # electron always uses per user app data
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      !insertmacro copyFile "$EXEPATH" "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    !endif
  !endif

  File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"
!macroend

!macro registryAddInstallInfo
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts "true"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" ShortcutName "${SHORTCUT_NAME}"
  !ifdef MENU_FILENAME
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory "${MENU_FILENAME}"
  !endif

  ${if} $installMode == "all"
    StrCpy $0 "/allusers"
    StrCpy $1 ""
  ${else}
    StrCpy $0 "/currentuser"
    StrCpy $1 ""
  ${endIf}

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayName "${UNINSTALL_DISPLAY_NAME}$1"
  # https://github.com/electron-userland/electron-builder/issues/750
  StrCpy $2 "$INSTDIR\${UNINSTALL_FILENAME}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$2" $0'
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString '"$2" $0 /S'

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
  !ifdef UNINSTALLER_ICON
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\uninstallerIcon.ico"
  !else
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
  !endif

  !ifdef COMPANY_NAME
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Publisher" "${COMPANY_NAME}"
  !endif

  !ifdef APP_DESCRIPTION
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Comments" "${APP_DESCRIPTION}"
  !endif

  !ifdef UNINSTALL_URL_HELP
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "HelpLink" "${UNINSTALL_URL_HELP}"
  !endif

  !ifdef UNINSTALL_URL_INFO_ABOUT
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "URLInfoAbout" "${UNINSTALL_URL_INFO_ABOUT}"
  !endif

  !ifdef UNINSTALL_URL_UPDATE_INFO
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "URLUpdateInfo" "${UNINSTALL_URL_UPDATE_INFO}"
  !endif

  !ifdef UNINSTALL_URL_README
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Readme" "${UNINSTALL_URL_README}"
  !endif

  WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" NoModify 1
  WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" NoRepair 1

  # allow user to define ESTIMATED_SIZE to avoid GetSize call
  !ifdef ESTIMATED_SIZE
    IntFmt $0 "0x%08X" ${ESTIMATED_SIZE}
  !else
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
  !endif

  WriteRegDWORD SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "EstimatedSize" "$0"
!macroend

!macro cleanupOldMenuDirectory
  ${if} $oldMenuDirectory != ""
    !ifdef MENU_FILENAME
      ${if} $oldMenuDirectory != "${MENU_FILENAME}"
        RMDir "$SMPROGRAMS\$oldMenuDirectory"
      ${endIf}
    !else
      RMDir "$SMPROGRAMS\$oldMenuDirectory"
    !endif
  ${endIf}
!macroend

!macro createMenuDirectory
  !ifdef MENU_FILENAME
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    ClearErrors
  !endif
!macroend

!macro addStartMenuLink keepShortcuts
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    # The keepShortcuts mechanism is NOT enabled.
    # Menu shortcut will be recreated.
    ${if} $keepShortcuts  == "false"
      !insertmacro cleanupOldMenuDirectory
      !insertmacro createMenuDirectory

      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      # clear error (if shortcut already exists)
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    # The keepShortcuts mechanism IS enabled.
    # The menu shortcut could either not exist (it shouldn't be recreated) or exist in an obsolete location.
    ${elseif} $oldStartMenuLink != $newStartMenuLink
    ${andIf} ${FileExists} "$oldStartMenuLink"
      !insertmacro createMenuDirectory

      Rename $oldStartMenuLink $newStartMenuLink
      WinShell::UninstShortcut "$oldStartMenuLink"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

      !insertmacro cleanupOldMenuDirectory
    ${endIf}
  !endif
!macroend

!macro addDesktopLink keepShortcuts
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    # https://github.com/electron-userland/electron-builder/pull/1432
    ${ifNot} ${isNoDesktopShortcut}
      # The keepShortcuts mechanism is NOT enabled.
      # Shortcuts will be recreated.
      ${if} $keepShortcuts == "false"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      # The keepShortcuts mechanism IS enabled.
      # The desktop shortcut could exist in an obsolete location (due to name change).
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${andIf} ${FileExists} "$oldDesktopLink"
        Rename $oldDesktopLink $newDesktopLink
        WinShell::UninstShortcut "$oldDesktopLink"
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"

      !ifdef RECREATE_DESKTOP_SHORTCUT
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${orIfNot} ${FileExists} "$oldDesktopLink"
        ${ifNot} ${isUpdated}
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${endIf}
      !endif
      ${endIf}
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  !endif
!macroend
