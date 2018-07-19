import { debug } from "builder-util"

export interface Timer {
  end(): void
}

export class DevTimer implements Timer {
  private start = process.hrtime()

  constructor(private readonly label: string) {
  }

  endAndGet(): string {
    const end = process.hrtime(this.start)
    return `${end[0]}s ${Math.round(end[1] / 1000000)}ms`
  }

  end(): void {
    console.info(`${this.label}: ${this.endAndGet()}`)
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