!include FileFunc.nsh

!define FOLDERID_UserProgramFiles {5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}
!define KF_FLAG_CREATE 0x00008000

!define INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
!define UNINSTALL_DISPLAY_NAME "${PRODUCT_NAME} ${VERSION}"

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
    !ifndef BUILD_UNINSTALLER
      StrCpy $0 "$LocalAppData\Programs"
      # Win7 has a per-user programfiles known folder and this can be a non-default location
      System::Call 'Shell32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}",i ${KF_FLAG_CREATE},i0,*i.r2)i.r1'
      ${If} $1 == 0
        System::Call '*$2(&w${NSIS_MAX_STRLEN} .r1)'
        StrCpy $0 $1
        System::Call 'Ole32::CoTaskMemFree(ir2)'
      ${endif}
      StrCpy $INSTDIR "$0\${PRODUCT_FILENAME}"
    !endif

    # сhecks registry for previous installation path (both for upgrading, reinstall, or uninstall)
    ReadRegStr $perUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $perUserInstallationFolder != ""
      StrCpy $INSTDIR $perUserInstallationFolder
    ${endif}
  !macroend
!endif

!ifdef INSTALL_MODE_PER_ALL_USERS_REQUIRED
  Var perMachineInstallationFolder

  !macro setInstallModePerAllUsers
    StrCpy $installMode all
    SetShellVarContext all

    StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCT_FILENAME}"

    # checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
    ReadRegStr $perMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $perMachineInstallationFolder != ""
      StrCpy $INSTDIR $perMachineInstallationFolder
    ${endif}
  !macroend
!endif

# SHCTX is the hive HKLM if SetShellVarContext all, or HKCU if SetShellVarContext user
!macro registryAddInstallInfo
	# Write the installation path into the registry
	WriteRegStr SHCTX "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"

	# Write the uninstall keys for Windows
	${if} $installMode == "all"
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayName "${UNINSTALL_DISPLAY_NAME}"
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\${UNINSTALL_FILENAME}" /allusers'
	${else}
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayName "${UNINSTALL_DISPLAY_NAME} (only current user)"
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\${UNINSTALL_FILENAME}" /currentuser'
	${endif}

	WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
	WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
	WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Publisher" "${COMPANY_NAME}"
	WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" NoModify 1
	WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" NoRepair 1

	${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
	IntFmt $0 "0x%08X" $0
	WriteRegDWORD SHCTX "${UNINSTALL_REGISTRY_KEY}" "EstimatedSize" "$0"
!macroend