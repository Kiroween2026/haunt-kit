# Gesture spec template

Copy this file to `packages/gestures/specs/<your-gesture>.gesture.md` and fill it in. When Kiro saves it,
the "Gesture from spec" hook tells Kiro to write the detector and its tests.
Use plain sentences. Every line under "Must NOT fire when" becomes a property test.

## Name

kebab-case name, e.g. `double-shake`. It becomes the file name, the detector name and the event name.

## What the player does

One or two sentences about the physical motion.

## Sensors used

Which fields of a Sample it reads (ax/ay/az in m/s², gx/gy/gz in deg/s, beta/gamma in degrees, rms 0..1).

## Fires when

- One line per situation that must fire, with numbers.

## Must NOT fire when

- One line per situation that must stay quiet (a phone lying still, a single shake, slow tilting...).

## Config and defaults

| Field | Default | Meaning      |
| ----- | ------- | ------------ |
| name  | value   | what it does |

## Example recordings

List files from `recordings/`, or write "none yet" (the tests then use synthetic streams).
