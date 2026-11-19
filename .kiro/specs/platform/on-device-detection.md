# On-device detection (Y5)

Gesture detectors run on the phone (`packages/controller/src/pipeline.ts`). What the phone sends depends on the view the host set with `setUi`:

| View     | Sends                                                                                       | Why                            |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------ |
| `tilt`   | raw `sensor_frames`                                                                         | continuous input               |
| `scream` | raw `sensor_frames` (with `rms`)                                                            | continuous loudness            |
| `still`  | `gesture` events (`still` / `moved`) if a `hold-still` detector is bundled, else raw frames | the host only needs the result |
| `tap`    | `gesture` events                                                                            | the button sends `tap`         |
| `wait`   | nothing                                                                                     |                                |

Detectors run in every view except `wait`, so a shake is reported whatever the view. `?raw=1` on the controller URL streams raw frames in every view (for the Séance MCP and debugging).

Apps choose raw or event input through the host-sdk: `room.setUi(target, { view })`. No protocol change was needed.

Status: the pipeline is done and tested with fake detectors. `PHONE_DETECTORS` in `packages/controller/src/detectors.ts` is empty until Anish's `@haunt-kit/gestures` catalog is merged; then it's a one-line import.
