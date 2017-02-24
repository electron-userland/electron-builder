!include "common.nsh"

WindowIcon Off
AutoCloseWindow True
RequestExecutionLevel user

SilentInstall silent

Function .onInit
  !insertmacro check64BitAndSetRegView
FunctionEnd

Section
  StrCpy $INSTDIR $PLUGINSDIR\app
	SetOutPath $INSTDIR

	!insertmacro extractEmbeddedAppPackage

	ExecWait "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  SetOutPath $PLUGINSDIR
	RMDir /r $INSTDIR
SectionEnd