# Gesture spec: double-shake

## Name

`double-shake`

## What the player does

Shakes the phone, pauses for a moment, and shakes it again. Used for "shake twice to summon".

## Sensors used

Acceleration `ax`, `ay`, `az` in m/s². The size of the acceleration, so it works however the phone is held.

## Fires when

- Two separate shake bursts happen, with a calm pause of at least 300 ms between them, and the second burst is detected within 2500 ms of the first. Each burst is what the existing `shake` detector counts as a shake (3 peaks above 18 m/s²).
- This works the same at any sample rate from 30 to 120 Hz.
- The event is `double-shake` with data `gapMs`, the time between the two bursts being detected.

## Must NOT fire when

- The phone is held still, or has only sensor noise (acceleration within 0.2 m/s² of gravity).
- The player shakes once, however long the shake lasts (one continuous 3 s shake is one burst).
- Two bursts have no calm pause between them (under 300 ms apart): that is one longer shake.
- The second burst comes more than 2500 ms after the first.
- A single flick, spin or slow tilt happens.

## Config and defaults

| Field        | Default | Meaning                                                  |
| ------------ | ------- | -------------------------------------------------------- |
| `threshold`  | 18      | Peak size for a shake, m/s² (same as `shake`)            |
| `minPeaks`   | 3       | Peaks in one burst (same as `shake`)                     |
| `pauseMs`    | 300     | Calm time needed between the two bursts                  |
| `windowMs`   | 2500    | The second burst must come within this time of the first |
| `calmDelta`  | 4       | Acceleration within this of gravity counts as calm, m/s² |
| `cooldownMs` | 1000    | Quiet time after a double shake                          |

## Example recordings

None yet. The tests use synthetic streams, and the real recordings in `recordings/` must never fire it.
