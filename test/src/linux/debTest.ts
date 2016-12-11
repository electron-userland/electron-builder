import { Platform, Arch } from "out"
import { app } from "../helpers/packTester"

test.ifNotWindows("deb", app({targets: Platform.LINUX.createTarget("deb")}))

test.ifNotWindows("arm deb", app({targets: Platform.LINUX.createTarget("deb", Arch.armv7l)}))

test.ifNotWindows("custom depends", app({
    targets: Platform.LINUX.createTarget("deb"),
    config: {
      deb: {
        depends: ["foo"],
      }
    }
  },
  {
    expectedDepends: "foo"
  }))