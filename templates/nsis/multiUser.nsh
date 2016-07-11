!include FileFunc.nsh

!define FOLDERID_UserProgramFiles {5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}
!define KF_FLAG_CREATE 0x00008000

!ifdef UNINSTALL_FILENAME & VERSION & APP_EXECUTABLE_FILENAME & PRODUCT_NAME & COMPANY_NAME & PRODUCT_FILENAME
!else
	!error "Should define all variables: UNINSTALL_FILENAME & VERSION & APP_EXECUTABLE_FILENAME & PRODUCT_NAME & COMPANY_NAME & PRODUCT_FILENAME"
!endif

!define INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"

!ifndef MULTIUSER_INSTALLMODE_DISPLAYNAME
	!define MULTIUSER_INSTALLMODE_DISPLAYNAME "${PRODUCT_NAME} ${VERSION}"
!endif

# Current Install Mode ("AllUsers" or "CurrentUser")
Var MultiUser.InstallMode
Var HasPerUserInstallation ; 0 (false) or 1 (true)
Var HasPerMachineInstallation ; 0 (false) or 1 (true)
Var PerUserInstallationFolder
Var PerMachineInstallationFolder

# Sets install mode to "per-machine" (all users).
!macro MULTIUSER_INSTALLMODE_ALLUSERS UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
	# Install mode initialization - per-machine
	StrCpy $MultiUser.InstallMode AllUsers

	SetShellVarContext all

	!if "${UNINSTALLER_PREFIX}" != UN
		;Set default installation location for installer
		StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCT_FILENAME}"
	!endif

	; Checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
	ReadRegStr $PerMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
	${if} $PerMachineInstallationFolder != ""
		StrCpy $INSTDIR $PerMachineInstallationFolder
	${endif}

	!ifdef MULTIUSER_INSTALLMODE_${UNINSTALLER_PREFIX}FUNCTION
		Call "${MULTIUSER_INSTALLMODE_${UNINSTALLER_PREFIX}FUNCTION}"
	!endif
!macroend

# Sets install mode to "per-user".
!macro MULTIUSER_INSTALLMODE_CURRENTUSER UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
	StrCpy $MultiUser.InstallMode CurrentUser

	SetShellVarContext current

	!if "${UNINSTALLER_PREFIX}" != UN
	  # http://www.mathiaswestin.net/2012/09/how-to-make-per-user-installation-with.html
	  StrCpy $0 "$LocalAppData\Programs"
    # Win7 has a per-user programfiles known folder and this can be a non-default location
    System::Call 'Shell32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}",i ${KF_FLAG_CREATE},i0,*i.r2)i.r1'
    ${If} $1 == 0
      System::Call '*$2(&w${NSIS_MAX_STRLEN} .r1)'
      StrCpy $0 $1
      System::Call 'Ole32::CoTaskMemFree(ir2)'
    ${EndIf}
    StrCpy $Instdir "$0\${PRODUCT_FILENAME}"
	!endif

	# Checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
	ReadRegStr $PerUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
	${if} $PerUserInstallationFolder != ""
		StrCpy $INSTDIR $PerUserInstallationFolder
	${endif}

	!ifdef MULTIUSER_INSTALLMODE_${UNINSTALLER_PREFIX}FUNCTION
		Call "${MULTIUSER_INSTALLMODE_${UNINSTALLER_PREFIX}FUNCTION}"
	!endif
!macroend

Function MultiUser.InstallMode.AllUsers
	!insertmacro MULTIUSER_INSTALLMODE_ALLUSERS "" ""
FunctionEnd

Function MultiUser.InstallMode.CurrentUser
	!insertmacro MULTIUSER_INSTALLMODE_CURRENTUSER "" ""
FunctionEnd

Function un.MultiUser.InstallMode.AllUsers
	!insertmacro MULTIUSER_INSTALLMODE_ALLUSERS UN un.
FunctionEnd

Function un.MultiUser.InstallMode.CurrentUser
	!insertmacro MULTIUSER_INSTALLMODE_CURRENTUSER UN un.
FunctionEnd

!macro MULTIUSER_INIT_TEXTS
	!ifndef MULTIUSER_INIT_TEXT_ADMINREQUIRED
		!define MULTIUSER_INIT_TEXT_ADMINREQUIRED "$(^Caption) requires administrator privileges."
	!endif

	!ifndef MULTIUSER_INIT_TEXT_POWERREQUIRED
		!define MULTIUSER_INIT_TEXT_POWERREQUIRED "$(^Caption) requires at least Power User privileges."
	!endif

	!ifndef MULTIUSER_INIT_TEXT_ALLUSERSNOTPOSSIBLE
		!define MULTIUSER_INIT_TEXT_ALLUSERSNOTPOSSIBLE "Your user account does not have sufficient privileges to install $(^Name) for all users of this computer."
	!endif
!macroend

!macro initMultiUser UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
  !ifdef ONE_CLICK
    !ifdef INSTALL_MODE_PER_ALL_USERS
      Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
    !else
      Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
    !endif
  !else
    !insertmacro UAC_PageElevation_OnInit

    ${If} ${UAC_IsInnerInstance}
    ${AndIfNot} ${UAC_IsAdmin}
      # special return value for outer instance so it knows we did not have admin rights
      SetErrorLevel 0x666666
      Quit
    ${EndIf}

    !insertmacro MULTIUSER_INIT_TEXTS

    # checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
    StrCpy $HasPerMachineInstallation "0"
    StrCpy $HasPerUserInstallation "0"

    # set installation mode to setting from a previous installation
    ReadRegStr $PerMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $PerMachineInstallationFolder != ""
      StrCpy $HasPerMachineInstallation "1"
    ${endif}

    ReadRegStr $PerUserInstallationFolder HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $PerUserInstallationFolder != ""
      StrCpy $HasPerUserInstallation "1"
    ${endif}

    ${if} $HasPerUserInstallation == "1"
      ${andif} $HasPerMachineInstallation == "0"
      Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
    ${elseif} $HasPerUserInstallation == "0"
      ${andif} $HasPerMachineInstallation == "1"
      Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
    ${else}
      # if there is no installation, or there is both per-user and per-machine
      !ifdef INSTALL_MODE_PER_ALL_USERS
        Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
      !else
        Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
      !endif
    ${endif}
  !endif
!macroend

# SHCTX is the hive HKLM if SetShellVarContext all, or HKCU if SetShellVarContext user
!macro MULTIUSER_RegistryAddInstallInfo
	# Write the installation path into the registry
	WriteRegStr SHCTX "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"

	# Write the uninstall keys for Windows
	${if} $MultiUser.InstallMode == "AllUsers"
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayName "${MULTIUSER_INSTALLMODE_DISPLAYNAME}"
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\${UNINSTALL_FILENAME}" /allusers'
	${else}
		WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" DisplayName "${MULTIUSER_INSTALLMODE_DISPLAYNAME} (only current user)"
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

!macro MULTIUSER_RegistryRemoveInstallInfo
	DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
	DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"
!macroend