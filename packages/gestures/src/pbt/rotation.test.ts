import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { GestureEvent } from "@haunt-kit/protocol";
import { type Matrix3x3, rotatingStreamGen, so3RotationArb } from "./generators";
import { createShakeDetector } from "../detectors/shake";

function determinant3x3(R: Matrix3x3): number {
  return (
    R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
    R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
    R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0])
  );
}

describe("PBT Invariant 2: 3D Rotation Invariance in SO(3)", () => {
  it("generates mathematically valid SO(3) rotation matrices (R^T R = I, det(R) = +1)", () => {
    fc.assert(
      fc.property(so3RotationArb, (R) => {
        const det = determinant3x3(R);
        expect(det).toBeCloseTo(1.0, 5);

        // Verify orthogonality: R^T * R = I
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            let dot = 0;
            for (let k = 0; k < 3; k++) {
              dot += R[k]![row]! * R[k]![col]!;
            }
            const expected = row === col ? 1.0 : 0.0;
            expect(dot).toBeCloseTo(expected, 5);
          }
        }
      }),
      { numRuns: 50, seed: 40404 },
    );
  });

  it("shake detector is strictly rotation-invariant under any SO(3) 3D rotation", () => {
    fc.assert(
      fc.property(rotatingStreamGen(60), ({ unrotated, rotated }) => {
        const unrotatedDetector = createShakeDetector();
        const rotatedDetector = createShakeDetector();

        const unrotatedEvents: GestureEvent[] = [];
        const rotatedEvents: GestureEvent[] = [];

        // Run unrotated stream
        for (const s of unrotated) {
          unrotatedEvents.push(...unrotatedDetector.push(s));
        }

        // Run stream rotated by arbitrary 3D SO(3) matrix
        for (const s of rotated) {
          rotatedEvents.push(...rotatedDetector.push(s));
        }

        // 1. Exactly identical event counts
        expect(rotatedEvents.length).toBe(unrotatedEvents.length);

        // 2. Exactly identical event timestamps and matching intensities
        for (let i = 0; i < unrotatedEvents.length; i++) {
          const unrot = unrotatedEvents[i]!;
          const rot = rotatedEvents[i]!;

          expect(rot.name).toBe("shake");
          expect(rot.t).toBe(unrot.t);
          expect(rot.data?.intensity).toBeCloseTo(unrot.data?.intensity ?? 0, 4);
        }
      }),
      { numRuns: 40, seed: 50505 },
    );
  });
});
