!include nsDialogs.nsh
!include UAC.nsh

Function StartApp
  !insertmacro UAC_AsUser_ExecShell "" "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "" "" ""
FunctionEnd

RequestExecutionLevel user

Var HasTwoAvailableOptions ; 0 (false) or 1 (true)
Var RadioButtonLabel1

!macro MULTIUSER_INIT_QUIT UNINSTALLER_FUNCPREFIX
	!ifdef MULTIUSER_INIT_${UNINSTALLER_FUNCPREFIX}FUNCTIONQUIT
		Call "${MULTIUSER_INIT_${UNINSTALLER_FUNCPREFIX}FUCTIONQUIT}"
	!else
		Quit
	!endif
!macroend

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
  !insertmacro MUI_PAGE_INIT
  !insertmacro MULTIUSER_PAGEDECLARATION_INSTALLMODE
!macroend

!macro MULTIUSER_FUNCTION_INSTALLMODEPAGE PRE LEAVE UNINSTALLER_PREFIX UNINSTALLER_FUNCPREFIX
	Function "${UNINSTALLER_FUNCPREFIX}${PRE}"
		${If} ${UAC_IsInnerInstance}
		${AndIf} ${UAC_IsAdmin}
		  # Inner Process (and Admin) - skip selection, inner process is always used for elevation (machine-wide)
			Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
			Abort
		${EndIf}

    ${GetParameters} $R0
    ${GetOptions} $R0 "/allusers" $R1
    IfErrors notallusers
    Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
    Abort

    notallusers:

    ${GetOptions} $R0 "/currentuser" $R1
    IfErrors notcurrentuser
    Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
    Abort

    notcurrentuser:

		# If uninstalling, will check if there is both a per-user and per-machine installation. If there is only one, will skip the form.
	  # If uninstallation was invoked from the "add/remove programs" Windows will automatically requests elevation (depending if uninstall keys are in HKLM or HKCU)
		# so (for uninstallation) just checking UAC_IsAdmin would probably be enought to determine if it's a per-user or per-machine. However, user can run the uninstall.exe from the folder itself
		!if "${UNINSTALLER_PREFIX}" == UN
			${if} $HasPerUserInstallation == "1"
				${andif} $HasPerMachineInstallation == "0"
				Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.CurrentUser
				Abort
			${elseif} $HasPerUserInstallation == "0"
				${andif} $HasPerMachineInstallation == "1"
				Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
				Abort
			${endif}
		!endif

		!if "${UNINSTALLER_PREFIX}" == UN
			!insertmacro MUI_HEADER_TEXT "Choose Installation Options" "Who should this application be installed for?"
		!else
			!insertmacro MUI_HEADER_TEXT "Choose Uninstallation Options" "Which installation should be removed?"
		!endif

		nsDialogs::Create 1018
		Pop $MultiUser.InstallModePage

		!if "${UNINSTALLER_PREFIX}" != UN
			${NSD_CreateLabel} 0u 0u 300u 20u "Please select whether you wish to make this software available to all users or just yourself"
			StrCpy $8 "Anyone who uses this computer (&all users)"
			StrCpy $9 "Only for &me"
		!else
			${NSD_CreateLabel} 0u 0u 300u 20u "This software is installed both per-machine (all users) and per-user. $\r$\nWhich installation you wish to remove?"
			StrCpy $8 "Anyone who uses this computer (&all users)"
			StrCpy $9 "Only for &me"
		!endif
		Pop $MultiUser.InstallModePage.Text

		${NSD_CreateRadioButton} 10u 30u 280u 20u "$8"
		Pop $MultiUser.InstallModePage.AllUsers
		${IfNot} ${UAC_IsAdmin}
			!ifdef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION
				StrCpy $HasTwoAvailableOptions 1
			!else
			  # since radio button is disabled, we add that comment to the disabled control itself
				SendMessage $MultiUser.InstallModePage.AllUsers ${WM_SETTEXT} 0 "STR:$8 (must run as admin)"
				EnableWindow $MultiUser.InstallModePage.AllUsers 0 # start out disabled
				StrCpy $HasTwoAvailableOptions 0
			!endif
		${else}
			StrCpy $HasTwoAvailableOptions 1
		${endif}

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
			${if} ${UAC_IsAdmin}
			  Call ${UNINSTALLER_FUNCPREFIX}MultiUser.InstallMode.AllUsers
      ${else}
				!ifdef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION
					GetDlgItem $9 $HWNDParent 1
					System::Call user32::GetFocus()i.s
          EnableWindow $9 0 ;disable next button
          !insertmacro UAC_PageElevation_RunElevated
          EnableWindow $9 1
          System::Call user32::SetFocus(is) ;Do we need WM_NEXTDLGCTL or can we get away with this hack?
          ${If} $2 = 0x666666 ;our special return, the new process was not admin after all
            MessageBox mb_iconExclamation "You need to login with an account that is a member of the admin group to continue..."
            Abort
          ${ElseIf} $0 = 1223 ;cancel
            Abort
          ${Else}
            ${If} $0 <> 0
              ${If} $0 = 1062
                MessageBox mb_iconstop "Unable to elevate, Secondary Logon service not running!"
              ${Else}
                MessageBox mb_iconstop "Unable to elevate, error $0"
              ${EndIf}
              Abort
            ${EndIf}
          ${EndIf}
          Quit
				!endif
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
			${ifNot} ${UAC_IsAdmin}
				StrCpy $7 "$7 (will prompt for admin credentials)"
				SendMessage $0 ${BCM_SETSHIELD} 0 1 ; display SHIELD
			${else}
				SendMessage $0 ${BCM_SETSHIELD} 0 0 ; hide SHIELD
			${endif}
		${endif}
		SendMessage $RadioButtonLabel1 ${WM_SETTEXT} 0 "STR:$7"
	FunctionEnd
!macroend