import { Platform } from "out"
import { app } from "../helpers/packTester"

test.ifWinCi("AppX", app({targets: Platform.WINDOWS.createTarget(["appx"])}))