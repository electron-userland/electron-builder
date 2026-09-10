# build resources dir is registered via !addincludedir, so sibling scripts can be included by name
!include "included-sibling.nsh"

!macro customUnInstall
  !system "echo '' > ${BUILD_RESOURCES_DIR}/customUnInstallMarker"
!macroend
