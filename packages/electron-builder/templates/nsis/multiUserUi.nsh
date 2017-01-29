!include nsDialogs.nsh

Var HasTwoAvailableOptions
Var RadioButtonLabel1

!macro PAGE_INSTALL_MODE
  !insertmacro MUI_PAGE_INIT

  !insertmacro MUI_SET MULTIUSER_${MUI_PAGE_UNINSTALLER_PREFIX}INSTALLMODEPAGE ""
  Var MultiUser.InstallModePage
  Var MultiUser.InstallModePage.Text
  Var MultiUser.InstallModePage.AllUsers
  Var MultiUser.InstallModePage.CurrentUser
  Var MultiUser.InstallModePage.ReturnValue

  !ifndef BUILD_UNINSTALLER
    !insertmacro FUNCTION_INSTALL_MODE_PAGE_FUNCTION MultiUser.InstallModePre_${MUI_UNIQUEID} MultiUser.InstallModeLeave_${MUI_UNIQUEID} ""
    PageEx custom
      PageCallbacks MultiUser.InstallModePre_${MUI_UNIQUEID} MultiUser.InstallModeLeave_${MUI_UNIQUEID}
      Caption " "
    PageExEnd
  !else
    !insertmacro FUNCTION_INSTALL_MODE_PAGE_FUNCTION MultiUser.InstallModePre_${MUI_UNIQUEID} MultiUser.InstallModeLeave_${MUI_UNIQUEID} un.
    UninstPage custom un.multiUser.InstallModePre_${MUI_UNIQUEID} un.MultiUser.InstallModeLeave_${MUI_UNIQUEID}
  !endif
!macroend

!macro FUNCTION_INSTALL_MODE_PAGE_FUNCTION PRE LEAVE UNINSTALLER_FUNCPREFIX
	Function "${UNINSTALLER_FUNCPREFIX}${PRE}"
		${If} ${UAC_IsInnerInstance}
		${AndIf} ${UAC_IsAdmin}
		  # inner Process (and Admin) - skip selection, inner process is always used for elevation (machine-wide)
			!insertmacro setInstallModePerAllUsers
			Abort
		${EndIf}

    ${GetParameters} $R0
    ${GetOptions} $R0 "/allusers" $R1
    ${IfNot} ${Errors}
      StrCpy $hasPerMachineInstallation "1"
      StrCpy $hasPerUserInstallation "0"
      ${IfNot} ${UAC_IsAdmin}
        ShowWindow $HWNDPARENT ${SW_HIDE}
        !insertmacro UAC_RunElevated
        Quit
      ${endif}

      !insertmacro setInstallModePerAllUsers
      Abort
    ${EndIf}

    ${GetOptions} $R0 "/currentuser" $R1
    ${IfNot} ${Errors}
      StrCpy $hasPerMachineInstallation "0"
      StrCpy $hasPerUserInstallation "1"
      !insertmacro setInstallModePerUser
      Abort
    ${EndIf}

		# If uninstalling, will check if there is both a per-user and per-machine installation. If there is only one, will skip the form.
	  # If uninstallation was invoked from the "add/remove programs" Windows will automatically requests elevation (depending if uninstall keys are in HKLM or HKCU)
		# so (for uninstallation) just checking UAC_IsAdmin would probably be enought to determine if it's a per-user or per-machine. However, user can run the uninstall.exe from the folder itself
		!ifdef BUILD_UNINSTALLER
			${if} $hasPerUserInstallation == "1"
      ${andif} $hasPerMachineInstallation == "0"
				!insertmacro setInstallModePerUser
				Abort
			${elseif} $hasPerUserInstallation == "0"
      ${andif} $hasPerMachineInstallation == "1"
				${IfNot} ${UAC_IsAdmin}
          ShowWindow $HWNDPARENT ${SW_HIDE}
          !insertmacro UAC_RunElevated
          Quit
        ${endif}

				!insertmacro setInstallModePerAllUsers
				Abort
			${endif}

      !insertmacro MUI_HEADER_TEXT "Choose Uninstallation Options" "Which installation should be removed?"
		!else
      !insertmacro MUI_HEADER_TEXT "Choose Installation Options" "Who should this application be installed for?"
		!endif

    !insertmacro MUI_PAGE_FUNCTION_CUSTOM PRE
		nsDialogs::Create 1018
		Pop $MultiUser.InstallModePage

		!ifndef BUILD_UNINSTALLER
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

		${if} $installMode == "all"
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
			${IfNot} ${UAC_IsAdmin}
        ShowWindow $HWNDPARENT ${SW_HIDE}
        !insertmacro UAC_RunElevated
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
        Abort
      ${else}
        !insertmacro setInstallModePerAllUsers
			${endif}
		${else}
			!insertmacro setInstallModePerUser
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
			${if} $hasPerUserInstallation == "1"
				!ifndef BUILD_UNINSTALLER
					StrCpy $7 "There is already a per-user installation. ($perUserInstallationFolder)$\r$\nWill reinstall/upgrade."
				!else
					StrCpy $7 "There is a per-user installation. ($perUserInstallationFolder)$\r$\nWill uninstall."
				!endif
			${else}
				StrCpy $7 "Fresh install for current user only."
			${endif}
			SendMessage $0 ${BCM_SETSHIELD} 0 0 ; hide SHIELD
		${else} ; all users
			${if} $hasPerMachineInstallation == "1"
				!ifndef BUILD_UNINSTALLER
					StrCpy $7 "There is already a per-machine installation. ($perMachineInstallationFolder)$\r$\nWill reinstall/upgrade."
				!else
					StrCpy $7 "There is a per-machine installation. ($perMachineInstallationFolder)$\r$\nWill uninstall."
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