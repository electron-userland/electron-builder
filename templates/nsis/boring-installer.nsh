# http://nsis.sourceforge.net/Run_an_application_shortcut_after_an_install
!include NsisMultiUser.nsh
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"

!define MUI_CUSTOMFUNCTION_GUIINIT GuiInit

!insertmacro MULTIUSER_PAGE_INSTALLMODE
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

# uninstall pages
!insertmacro MUI_UNPAGE_INSTFILES

Function GuiInit
  !insertmacro UAC_PageElevation_OnGuiInit
FunctionEnd