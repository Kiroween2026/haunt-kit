// Owner: Anish. Registry that maps a gesture name to its detector.
import type { Detector } from "@haunt-kit/protocol";
import {
  flickDetector,
  flipDetector,
  holdStillDetector,
  repDetector,
  screamDetector,
  shakeDetector,
  spinDetector,
  tapDetector,
  tiltDetector,
} from "./detectors";

export type AnyDetector = Detector<unknown>;

export class GestureCatalog {
  private readonly detectors = new Map<string, AnyDetector>();

  register(detector: AnyDetector): this {
    this.detectors.set(detector.name, detector);
    return this;
  }

  get(name: string): AnyDetector | undefined {
    return this.detectors.get(name);
  }

  has(name: string): boolean {
    return this.detectors.has(name);
  }

  list(): string[] {
    return [...this.detectors.keys()];
  }

  /** A new detector instance with its default config merged with `config`. */
  create(name: string, config?: Record<string, unknown>) {
    const detector = this.detectors.get(name);
    if (!detector) throw new Error(`Unknown gesture "${name}". Known: ${this.list().join(", ")}`);
    return detector.create({ ...(detector.defaults as object), ...config });
  }
}

/** All built-in detectors. */
export const catalog = new GestureCatalog()
  .register(tiltDetector)
  .register(shakeDetector)
  .register(holdStillDetector)
  .register(flickDetector)
  .register(spinDetector)
  .register(flipDetector)
  .register(screamDetector)
  .register(tapDetector)
  .register(repDetector);
