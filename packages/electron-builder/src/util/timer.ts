import { debug } from "electron-builder-util"

export interface Timer {
  end(): void
}

class DevTimer implements Timer {
  private start = process.hrtime()

  constructor(private readonly label: string) {
  }

  end(): void {
    const end = process.hrtime(this.start)
    console.info(`${this.label}: %ds %dms`, end[0], end[1] / 1000000)
  }
}

class ProductionTimer implements Timer {
  end(): void {
    // ignore
  }
}

export function time(label: string): Timer {
  return debug.enabled ? new DevTimer(label) : new ProductionTimer()
}