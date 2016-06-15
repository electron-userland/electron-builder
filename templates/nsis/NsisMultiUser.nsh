/*
SimpleMultiUser.nsh - Installer/Uninstaller that allows installations "per-user" (no admin required) or "per-machine" (asks elevation *only when necessary*)
By Ricardo Drizin (contact at http://drizin.com.br)

This plugin is based on [MultiUser.nsh (by Joost Verburg)](http://nsis.sourceforge.net/Docs/MultiUser/Readme.html) but with some new features and some simplifications:
- Installer allows installations "per-user" (no admin required) or "per-machine" (as original)
- If running user IS part of Administrators group, he is not forced to elevate (only if necessary - for per-machine install)
- If running user is NOT part of Administrators group, he is still able to elevate and install per-machine (I expect that power-users will have administrator password, but will not be part of the administrators group)
- UAC Elevation happens only when necessary (when per-machine is selected), not in the start of the installer
- Uninstaller block is mandatory (why shouldn't it be?)
- If there are both per-user and per-machine installations, user can choose which one to remove during uninstall
- Correctly creates and removes shortcuts and registry (per-user and per-machine are totally independent)
- Fills uninstall information in registry like Icon and Estimated Size.
- If running as non-elevated user, the "per-machine" install can be allowed (automatically invoking UAC elevation) or can be disabled (suggesting to run again as elevated user)
- If elevation is invoked for per-machine install, the calling process automatically hides itself, and the elevated inner process automatically skips the choice screen (cause in this case we know that per-machine installation was chosen)
- If uninstalling from the "add/remove programs", automatically detects if user is trying to remove per-machine or per-user install

*/

!verbose push
!verbose 3

;Standard NSIS header files
!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh
!include WinVer.nsh
!include FileFunc.nsh
!include UAC.nsh

;Variables
Var MultiUser.Privileges ; Current user level: "Admin", "Power" (up to Windows XP), or else regular user.
Var MultiUser.InstallMode ; Current Install Mode ("AllUsers" or "CurrentUser")
Var IsAdmin ; 0 (false) or 1 (true)
Var HasPerUserInstallation ; 0 (false) or 1 (true)
Var HasPerMachineInstallation ; 0 (false) or 1 (true)
Var PerUserInstallationFolder
Var PerMachineInstallationFolder 
Var HasTwoAvailableOptions ; 0 (false) or 1 (true)
Var RadioButtonLabel1
;Var RadioButtonLabel2
;Var RadioButtonLabel3

!define FOLDERID_UserProgramFiles {5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}
!define KF_FLAG_CREATE 0x00008000

!ifdef MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY & MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY & MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME & UNINSTALL_FILENAME & VERSION & APP_EXECUTABLE_FILENAME & PRODUCT_NAME & COMPANY_NAME & INST_DIR_NAME
!else
	!error "Should define all variables: MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY & MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY & MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME & UNINSTALL_FILENAME & VERSION & APP_EXECUTABLE_FILENAME & PRODUCT_NAME & COMPANY_NAME & INST_DIR_NAME"
!endif

!define MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2 "Software\${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY}"
!define MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2 "Software\Microsoft\Windows\CurrentVersion\Uninstall\${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY}"

!ifndef MULTIUSER_INSTALLMODE_DISPLAYNAME
	!define MULTIUSER_INSTALLMODE_DISPLAYNAME "${PRODUCT_NAME} ${VERSION}"
!endif

RequestExecutionLevel user ; will ask elevation only if necessary

; Sets install mode to "per-machine" (all users).
!macro MULTIUSER_INSTALLMODE_ALLUSERS UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
	;Install mode initialization - per-machine
	StrCpy $MultiUser.InstallMode AllUsers

	SetShellVarContext all

	!if "${UNINSTALLER_PREFIX}" != UN
		;Set default installation location for installer
		StrCpy $INSTDIR "$PROGRAMFILES\${INST_DIR_NAME}"
	!endif

	; Checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
	ReadRegStr $PerMachineInstallationFolder HKLM "${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME}"
	${if} $PerMachineInstallationFolder != ""
		StrCpy $INSTDIR $PerMachineInstallationFolder
	${endif}

	!ifdef MULTIUSER_INSTALLMODE_${UNINSTALLER_PREFIX}FUNCTION
		Call "${MULTIUSER_INSTALLMODE_${UNINSTALLER_PREFIX}FUNCTION}"
	!endif
!macroend

; Sets install mode to "per-user".
!macro MULTIUSER_INSTALLMODE_CURRENTUSER UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
	StrCpy $MultiUser.InstallMode CurrentUser

	SetShellVarContext current

	!if "${UNINSTALLER_PREFIX}" != UN
	  # http://www.mathiaswestin.net/2012/09/how-to-make-per-user-installation-with.html
	  StrCpy $0 "$LocalAppData\Programs"
    ${If} ${IsNT}
      ;Win7 has a per-user programfiles known folder and this can be a non-default location
      System::Call 'Shell32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}",i ${KF_FLAG_CREATE},i0,*i.r2)i.r1'
      ${If} $1 == 0
        System::Call '*$2(&w${NSIS_MAX_STRLEN} .r1)'
        StrCpy $0 $1
        System::Call 'Ole32::CoTaskMemFree(ir2)'
      ${EndIf}
    ${Else}
      ;Everyone is admin on Win9x, so falling back to $ProgramFiles is ok
      ${IfThen} $LocalAppData == "" ${|} StrCpy $0 $ProgramFiles ${|}
    ${EndIf}
    StrCpy $Instdir "$0\${INST_DIR_NAME}"
	!endif

	; Checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
	ReadRegStr $PerUserInstallationFolder HKCU "${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME}"
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

/****** Installer/uninstaller initialization ******/

!macro MULTIUSER_INIT_QUIT UNINSTALLER_FUNCPREFIX
	!ifdef MULTIUSER_INIT_${UNINSTALLER_FUNCPREFIX}FUNCTIONQUIT
		Call "${MULTIUSER_INIT_${UNINSTALLER_FUNCPREFIX}FUCTIONQUIT}"
	!else
		Quit
	!endif
!macroend

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

!macro MULTIUSER_INIT_CHECKS UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX

	;Installer initialization - check privileges and set default install mode
	!insertmacro MULTIUSER_INIT_TEXTS

	UserInfo::GetAccountType
	Pop $MultiUser.Privileges
	${if} $MultiUser.Privileges == "Admin"
		${orif} $MultiUser.Privileges == "Power"
		StrCpy $IsAdmin 1
	${else}
		StrCpy $IsAdmin 0
	${endif}

	; Checks registry for previous installation path (both for upgrading, reinstall, or uninstall)
	StrCpy $HasPerMachineInstallation 0
	StrCpy $HasPerUserInstallation 0
	;Set installation mode to setting from a previous installation
	ReadRegStr $PerMachineInstallationFolder HKLM "${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME}"
	${if} $PerMachineInstallationFolder != ""
		StrCpy $HasPerMachineInstallation 1
	${endif}
	ReadRegStr $PerUserInstallationFolder HKCU "${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME}"
	${if} $PerUserInstallationFolder != ""
		StrCpy $HasPerUserInstallation 1
	${endif}
	
	${if} $HasPerUserInstallation == "1" ; if there is only one installation... set it as default...
		${andif} $HasPerMachineInstallation == "0"
		Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
	${elseif} $HasPerUserInstallation == "0" ; if there is only one installation... set it as default...
		${andif} $HasPerMachineInstallation == "1"
		Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
	${else} ; if there is no installation, or there is both per-user and per-machine...
		${if} ${IsNT}
			${if} $IsAdmin == "1" ;If running as admin, default to per-machine installation if possible (unless default is forced by MULTIUSER_INSTALLMODE_DEFAULT_CURRENTUSER)
				!if MULTIUSER_INSTALLMODE_DEFAULT_CURRENTUSER
					Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
				!else
					Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
				!endif
			${else} ;If not running as admin, default to per-user installation (unless default is forced by MULTIUSER_INSTALLMODE_DEFAULT_ALLUSERS and elevation is allowed MULTIUSER_INSTALLMODE_ALLOW_ELEVATION)
				!ifdef MULTIUSER_INSTALLMODE_DEFAULT_ALLUSERS & MULTIUSER_INSTALLMODE_ALLOW_ELEVATION
					Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
				!else
					Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
				!endif
			${endif}
		${else} ; Not running Windows NT, (so it's Windows XP at best), so per-user installation not supported
			Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
		${endif}
	${endif}
	
!macroend

!macro MULTIUSER_INIT
	!verbose push
	!verbose 3

	; se for inner (sub processo) e ainda assim não for admin... algo errado
	${If} ${UAC_IsInnerInstance}
	${AndIfNot} ${UAC_IsAdmin}
		;MessageBox MB_OK "This account doesn't have admin rights"
		SetErrorLevel 0x666666 ;special return value for outer instance so it knows we did not have admin rights
		Quit
	${EndIf}

	!insertmacro MULTIUSER_INIT_CHECKS "" ""
	!verbose pop 
!macroend

!macro MULTIUSER_UNINIT
	!verbose push
	!verbose 3
	!insertmacro MULTIUSER_INIT_CHECKS Un un.
	!verbose pop 
!macroend

/****** Modern UI 2 page ******/
!macro MULTIUSER_INSTALLMODEPAGE_INTERFACE
	Var MultiUser.InstallModePage
	Var MultiUser.InstallModePage.Text
	Var MultiUser.InstallModePage.AllUsers
	Var MultiUser.InstallModePage.CurrentUser
	Var MultiUser.InstallModePage.ReturnValue
!macroend

!macro MULTIUSER_PAGEDECLARATION_INSTALLMODE
	!insertmacro MUI_SET MULTIUSER_${MUI_PAGE_UNINSTALLER_PREFIX}INSTALLMODEPAGE ""
	!insertmacro MULTIUSER_INSTALLMODEPAGE_INTERFACE
	!insertmacro MULTIUSER_FUNCTION_INSTALLMODEPAGE MultiUser.InstallModePre_${MUI_UNIQUEID} MultiUser.InstallModeLeave_${MUI_UNIQUEID} "" ""
	!insertmacro MULTIUSER_FUNCTION_INSTALLMODEPAGE MultiUser.InstallModePre_${MUI_UNIQUEID} MultiUser.InstallModeLeave_${MUI_UNIQUEID} UN un.

	PageEx custom
		PageCallbacks MultiUser.InstallModePre_${MUI_UNIQUEID} MultiUser.InstallModeLeave_${MUI_UNIQUEID}
		Caption " "
	PageExEnd

	UninstPage custom un.MultiUser.InstallModePre_${MUI_UNIQUEID} un.MultiUser.InstallModeLeave_${MUI_UNIQUEID}
!macroend

!macro MULTIUSER_PAGE_INSTALLMODE
	;Modern UI page for install mode
	!verbose push
	!verbose 3
	!insertmacro MUI_PAGE_INIT
	!insertmacro MULTIUSER_PAGEDECLARATION_INSTALLMODE
	!verbose pop
!macroend

!macro MULTIUSER_FUNCTION_INSTALLMODEPAGE PRE LEAVE UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
	Function "${UNINSTALLER_FUNCPREFIX}${PRE}"

		${If} ${UAC_IsInnerInstance}
		${AndIf} ${UAC_IsAdmin}
			;MessageBox MB_OK 
			Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers ; Inner Process (and Admin) - skip selection, inner process is always used for elevation (machine-wide)
			Abort ; // next page
		${EndIf}
		
		; If uninstalling, will check if there is both a per-user and per-machine installation. If there is only one, will skip the form.
		; If uninstallation was invoked from the "add/remove programs" Windows will automatically requests elevation (depending if uninstall keys are in HKLM or HKCU)
		; so (for uninstallation) just checking UAC_IsAdmin would probably be enought to determine if it's a per-user or per-machine. However, user can run the uninstall.exe from the folder itself, do I'd rather check.
		!if "${UNINSTALLER_PREFIX}" == UN
			${if} $HasPerUserInstallation == "1" ; if there is only one installation... skip form.. only one uninstall available
				${andif} $HasPerMachineInstallation == "0"
				Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser ; Uninstaller has only HasPerUserInstallation
				Abort ; // next page
			${elseif} $HasPerUserInstallation == "0" ; if there is only one installation... skip form.. only one uninstall available
				${andif} $HasPerMachineInstallation == "1"
				Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers ; Uninstaller has only HasPerMachineInstallation
				Abort ; // next page
			${endif} 
		!endif

		${GetParameters} $R0
		${GetOptions} $R0 "/allusers" $R1
		IfErrors notallusers
		${if} $IsAdmin == "0" 
			ShowWindow $HWNDPARENT ${SW_HIDE} ; HideWindow would work?
			!insertmacro UAC_RunElevated
			Quit ;we are the outer process, the inner process has done its work (ExitCode is $2), we are done
		${endif}
		Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers ; Uninstaller has only HasPerMachineInstallation
		Abort ; // next page		  
	notallusers:
		${GetOptions} $R0 "/currentuser" $R1
		IfErrors notcurrentuser
		Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser ; Uninstaller has only HasPerUserInstallation
		Abort ; // next page
	notcurrentuser:
		
		
		!insertmacro MUI_PAGE_FUNCTION_CUSTOM PRE
		;!insertmacro MUI_HEADER_TEXT_PAGE $(MULTIUSER_TEXT_INSTALLMODE_TITLE) $(MULTIUSER_TEXT_INSTALLMODE_SUBTITLE) ; "Choose Users" and "Choose for which users you want to install $(^NameDA)."
		
		!if "${UNINSTALLER_PREFIX}" != UN
			!insertmacro MUI_HEADER_TEXT "Choose Installation Options" "Who should this application be installed for?"
		!else
			!insertmacro MUI_HEADER_TEXT "Choose Uninstallation Options" "Which installation should be removed?"
		!endif
		
		nsDialogs::Create 1018
		Pop $MultiUser.InstallModePage

		; default was MULTIUSER_TEXT_INSTALLMODE_TITLE "Choose Users"
		!if "${UNINSTALLER_PREFIX}" != UN
			${NSD_CreateLabel} 0u 0u 300u 20u "Please select whether you wish to make this software available to all users or just yourself"
			StrCpy $8 "Anyone who uses this computer (&all users)" ; this was MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Install for anyone using this computer"
			StrCpy $9 "Only for &me" ; this was MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Install just for me"
		!else
			${NSD_CreateLabel} 0u 0u 300u 20u "This software is installed both per-machine (all users) and per-user. $\r$\nWhich installation you wish to remove?"
			StrCpy $8 "Anyone who uses this computer (&all users)" ; this was MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Install for anyone using this computer"
			StrCpy $9 "Only for &me" ; this was MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Install just for me"
		!endif
		Pop $MultiUser.InstallModePage.Text

		; criando os radios (disabled se não for admin/power) e pegando os hwnds (handles)
		${NSD_CreateRadioButton} 10u 30u 280u 20u "$8"
		Pop $MultiUser.InstallModePage.AllUsers
		${if} $IsAdmin == "0" 
			!ifdef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION ; if elevation is allowed.. "(will prompt for admin credentials)" (will appear at bottom when option is chosen)
				StrCpy $HasTwoAvailableOptions 1
			!else
				SendMessage $MultiUser.InstallModePage.AllUsers ${WM_SETTEXT} 0 "STR:$8 (must run as admin)" ; since radio button is disabled, we add that comment to the disabled control itself
				EnableWindow $MultiUser.InstallModePage.AllUsers 0 # start out disabled
				StrCpy $HasTwoAvailableOptions 0
			!endif
		${else}
			StrCpy $HasTwoAvailableOptions 1
		${endif}
		
		;${NSD_CreateRadioButton} 20u 70u 280u 10u "$9"
		System::Call "advapi32::GetUserName(t.r0,*i${NSIS_MAX_STRLEN})i"
		${NSD_CreateRadioButton} 10u 50u 280u 20u "$9 ($0)"
		Pop $MultiUser.InstallModePage.CurrentUser


		nsDialogs::SetUserData $MultiUser.InstallModePage.AllUsers 1 ; Install for All Users (1, pra exibir o icone SHIELD de elevation)
		nsDialogs::SetUserData $MultiUser.InstallModePage.CurrentUser 0	; Install for Single User (0 pra não exibir)

		${if} $HasTwoAvailableOptions == "1" ; if there are 2 available options, bind to radiobutton change
			${NSD_OnClick} $MultiUser.InstallModePage.CurrentUser ${UNINSTALLER_FUNCPREFIX}InstModeChange
			${NSD_OnClick} $MultiUser.InstallModePage.AllUsers ${UNINSTALLER_FUNCPREFIX}InstModeChange
		${endif}
		
		${NSD_CreateLabel} 0u 110u 280u 50u ""
		Pop $RadioButtonLabel1
		;${NSD_CreateLabel} 0u 120u 280u 20u ""
		;Pop $RadioButtonLabel2
		;${NSD_CreateLabel} 0u 130u 280u 20u ""
		;Pop $RadioButtonLabel3

		
		
		${if} $MultiUser.InstallMode == "AllUsers" ; setting defaults
			SendMessage $MultiUser.InstallModePage.AllUsers ${BM_SETCHECK} ${BST_CHECKED} 0 ; set as default
			SendMessage $MultiUser.InstallModePage.AllUsers ${BM_CLICK} 0 0 ; trigger click event
		${else}
			SendMessage $MultiUser.InstallModePage.CurrentUser ${BM_SETCHECK} ${BST_CHECKED} 0 ; set as default
			SendMessage $MultiUser.InstallModePage.CurrentUser ${BM_CLICK} 0 0 ; trigger click event
		${endif}
		
		!insertmacro MUI_PAGE_FUNCTION_CUSTOM SHOW
		nsDialogs::Show

	FunctionEnd

	Function "${UNINSTALLER_FUNCPREFIX}${LEAVE}"
		SendMessage $MultiUser.InstallModePage.AllUsers ${BM_GETCHECK} 0 0 $MultiUser.InstallModePage.ReturnValue

		${if} $MultiUser.InstallModePage.ReturnValue = ${BST_CHECKED}
			${if} $IsAdmin == "0" 
				!ifdef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION ; if it's not Power or Admin, but elevation is allowed, then elevate...
					;MessageBox MB_OK "Will elevate and quit"
					ShowWindow $HWNDPARENT ${SW_HIDE} ; HideWindow would work?
					!insertmacro UAC_RunElevated
					;MessageBox MB_OK "[$0]/[$1]/[$2]/[$3]"
					
					;http://www.videolan.org/developers/vlc/extras/package/win32/NSIS/UAC/Readme.html
					;http://nsis.sourceforge.net/UAC_plug-in
					${Switch} $0
					${Case} 0
						${If} $1 = 1 
							Quit ;we are the outer process, the inner process has done its work (ExitCode is $2), we are done
						${EndIf}
						${If} $1 = 3 ;RunAs completed successfully, but with a non-admin user
							${OrIf} $2 = 0x666666 ;our special return, the new process was not admin after all 
							MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "You need to login with an account that is a member of the admin group to continue..."
						${EndIf}
						${Break}
					${Case} 1223 ;user aborted
						;MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "This option requires admin privileges, aborting!"
						;Quit ; instead of quit just abort going to the next page, and stay in the radiobuttons
						${Break}
					${Case} 1062
						MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "Logon service not running, aborting!" ; "Unable to elevate, Secondary Logon service not running!"
						;Quit ; instead of quit just abort going to the next page, and stay in the radiobuttons
						${Break}
					${Default}
						MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "Unable to elevate, error $0"
						;Quit ; instead of quit just abort going to the next page, and stay in the radiobuttons
						${Break}
					${EndSwitch}				

					ShowWindow $HWNDPARENT ${SW_SHOW}
					BringToFront
					Abort ; Stay on page - http://nsis.sourceforge.net/Abort
				!else 			
						;se não é Power ou Admin, e não é permitida elevation, então nem deveria ter chegado aqui... o radiobutton deveria estar disabled
				!endif
			${else}
				Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers ; if it's Power or Admin, just go on with installation...
			${endif}
		${else}
			Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
		${endif}

		!insertmacro MUI_PAGE_FUNCTION_CUSTOM LEAVE
	FunctionEnd

	Function "${UNINSTALLER_FUNCPREFIX}InstModeChange"
		pop $1
		nsDialogs::GetUserData $1
		pop $1
		GetDlgItem $0 $hwndParent 1 ; get item 1 (next button) at parent window, store in $0 - (0 is back, 1 is next .. what about CANCEL? http://nsis.sourceforge.net/Buttons_Header )
		
		StrCpy $7 ""
		${if} "$1" == "0" ; current user
			${if} $HasPerUserInstallation == "1"
				!if "${UNINSTALLER_PREFIX}" != UN
					StrCpy $7 "There is already a per-user installation. ($PerUserInstallationFolder)$\r$\nWill reinstall/upgrade."
				!else
					StrCpy $7 "There is a per-user installation. ($PerUserInstallationFolder)$\r$\nWill uninstall."
				!endif
			${else}
				StrCpy $7 "Fresh install for current user only"
			${endif}
			SendMessage $0 ${BCM_SETSHIELD} 0 0 ; hide SHIELD
		${else} ; all users
			${if} $HasPerMachineInstallation == "1"
				!if "${UNINSTALLER_PREFIX}" != UN
					StrCpy $7 "There is already a per-machine installation. ($PerMachineInstallationFolder)$\r$\nWill reinstall/upgrade."
				!else
					StrCpy $7 "There is a per-machine installation. ($PerMachineInstallationFolder)$\r$\nWill uninstall."
				!endif
			${else}
				StrCpy $7 "Fresh install for all users"
			${endif}
			${if} $IsAdmin == "0"
				StrCpy $7 "$7 (will prompt for admin credentials)"
				SendMessage $0 ${BCM_SETSHIELD} 0 1 ; display SHIELD
			${else}
				SendMessage $0 ${BCM_SETSHIELD} 0 0 ; hide SHIELD
			${endif}
		${endif}
		SendMessage $RadioButtonLabel1 ${WM_SETTEXT} 0 "STR:$7"
		;SendMessage $RadioButtonLabel2 ${WM_SETTEXT} 0 "STR:$8"
		;SendMessage $RadioButtonLabel3 ${WM_SETTEXT} 0 "STR:$9"
	FunctionEnd

!macroend

; SHCTX is the hive HKLM if SetShellVarContext all, or HKCU if SetShellVarContext user
!macro MULTIUSER_RegistryAddInstallInfo
	!verbose push
	!verbose 3

	; Write the installation path into the registry
	WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME}" "$INSTDIR" ; "InstallLocation"

	; Write the uninstall keys for Windows
	${if} $MultiUser.InstallMode == "AllUsers" ; setting defaults
		WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "DisplayName" "${MULTIUSER_INSTALLMODE_DISPLAYNAME}"
		WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME}" '"$INSTDIR\${UNINSTALL_FILENAME}" /allusers' ; "UninstallString"
	${else}
		WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "DisplayName" "${MULTIUSER_INSTALLMODE_DISPLAYNAME} (only current user)" ; "add/remove programs" will show if installation is per-user
		WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "${MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME}" '"$INSTDIR\${UNINSTALL_FILENAME}" /currentuser' ; "UninstallString"
	${endif}

	WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "DisplayVersion" "${VERSION}"
	WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "DisplayIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
	WriteRegStr SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "Publisher" "${COMPANY_NAME}"
	WriteRegDWORD SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "NoModify" 1
	WriteRegDWORD SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "NoRepair" 1
	${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2 ; get folder size, convert to KB
	IntFmt $0 "0x%08X" $0
	WriteRegDWORD SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}" "EstimatedSize" "$0"

	!verbose pop 
!macroend

!macro MULTIUSER_RegistryRemoveInstallInfo
	!verbose push
	!verbose 3

	; Remove registry keys
	DeleteRegKey SHCTX "${MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY2}"
	DeleteRegKey SHCTX "${MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY2}"
 
	!verbose pop 
!macroend



!verbose pop
