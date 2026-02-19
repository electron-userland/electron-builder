!include nsDialogs.nsh

Var ShortcutsPageDialog
Var SHORTCUT_DESKTOP_CHECKBOX
Var SHORTCUT_STARTMENU_CHECKBOX

!macro PAGE_SHORTCUTS
  !insertmacro MUI_PAGE_INIT
  !insertmacro MUI_SET SHORTCUTS_PAGE ""

  PageEx custom
    PageCallbacks ShortcutsPagePre ShortcutsPageLeave
    Caption "Shortcuts"
  PageExEnd
!macroend

Function ShortcutsPagePre
  nsDialogs::Create 1018
  Pop $ShortcutsPageDialog
  ${If} $ShortcutsPageDialog == "error"
    Abort
  ${EndIf}

  ${NSD_CreateCheckBox} 10u 10u 120u 12u "Create Desktop Shortcut"
  Pop $SHORTCUT_DESKTOP_CHECKBOX
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    ${NSD_Check} $SHORTCUT_DESKTOP_CHECKBOX
  !endif

  ${NSD_CreateCheckBox} 10u 30u 140u 12u "Create Start Menu Shortcut"
  Pop $SHORTCUT_STARTMENU_CHECKBOX
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${NSD_Check} $SHORTCUT_STARTMENU_CHECKBOX
  !endif

  nsDialogs::Show
FunctionEnd

Function ShortcutsPageLeave
  ${NSD_GetState} $SHORTCUT_DESKTOP_CHECKBOX $0
  StrCpy $USER_DESKTOP_SHORTCUT_CHOICE $0
  ${NSD_GetState} $SHORTCUT_STARTMENU_CHECKBOX $0
  StrCpy $USER_STARTMENU_SHORTCUT_CHOICE $0
FunctionEnd