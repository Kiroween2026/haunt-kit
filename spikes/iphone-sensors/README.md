# Spike: iPhone Sensor Test (Task A1)

Standalone throwaway test harness to verify motion, orientation, audio loudness, and wake-lock APIs on physical iPhones before building app features.

This spike is excluded from the root monorepo build and pnpm workspace tasks.

---

## Quickstart

### 1. Install & Run Dev Server

From the repository root:

```bash
cd spikes/iphone-sensors
pnpm install
pnpm dev
```

By default, the Vite dev server starts on `http://localhost:5173`.

---

## 2. Opening on a Physical iPhone (HTTPS Required)

> **Important:** iOS Safari enforces HTTPS for `DeviceMotionEvent`, `DeviceOrientationEvent`, and `navigator.mediaDevices.getUserMedia()`. Accessing over plain HTTP (`http://192.168.x.x:5173`) will cause sensor and mic permissions to fail silently or be blocked.

To expose the local dev server over HTTPS via Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:5173
```

1. Look for the generated URL in the terminal, for example:
   `https://random-subdomain.trycloudflare.com`
2. Open this HTTPS URL in Safari on your iPhone.
3. Tap **Start Sensors**. When iOS prompts:
   - Allow "haunt-kit" to access motion and orientation sensors.
   - Allow microphone access.

---

## 3. What the Numbers Should Look Like

### When Flat on a Table (Screen Facing Up)

| Reading                     | Expected Nominal Value       | Explanation                                                         |
| :-------------------------- | :--------------------------- | :------------------------------------------------------------------ |
| **`ax`**                    | $\approx 0.00\text{ m/s}^2$  | No sideways tilt                                                    |
| **`ay`**                    | $\approx 0.00\text{ m/s}^2$  | No forward/backward tilt                                            |
| **`az`**                    | $\approx +9.81\text{ m/s}^2$ | Earth's gravity vector pointing up through screen ($+1.0\text{ g}$) |
| **Linear `x, y, z`**        | $\approx 0.00\text{ m/s}^2$  | Device is stationary (gravity subtracted)                           |
| **Rotation rate `α, β, γ`** | $\approx 0.00\text{ deg/s}$  | Device is not rotating                                              |
| **Orientation `β` (pitch)** | $\approx 0^\circ$            | Level with horizon                                                  |
| **Orientation `γ` (roll)**  | $\approx 0^\circ$            | Level side-to-side                                                  |
| **Sample Rate**             | $\approx 60.0\text{ Hz}$     | iPhone Safari typically samples at 60 Hz                            |
| **Mic RMS**                 | $\approx 0.000 - 0.030$      | Background room noise                                               |

### When Held Vertically in Hand (Portrait, Screen Facing You)

| Reading                     | Expected Nominal Value                    | Explanation                                         |
| :-------------------------- | :---------------------------------------- | :-------------------------------------------------- |
| **`ax`**                    | $\approx 0.00\text{ m/s}^2$               | Lateral acceleration                                |
| **`ay`**                    | $\approx -9.81\text{ m/s}^2$ (or $+9.81$) | Gravity vector acting along the length of the phone |
| **`az`**                    | $\approx 0.00\text{ m/s}^2$               | Normal to screen is horizontal                      |
| **Orientation `β` (pitch)** | $\approx 90^\circ$                        | Upright portrait position                           |

### When Speaking or Screaming

- Quiet room: RMS $\approx 0.000 - 0.040$
- Normal speaking: RMS $\approx 0.080 - 0.250$
- Loud scream: RMS $\approx 0.600 - 1.000$

_(Note: Raw audio is processed strictly in-memory into scalar RMS loudness; no audio data ever leaves the device or is saved)._

---

## 4. Ghost Recording Export (5-Second Samples)

1. Enter a descriptive label in the **Recording Label** field (e.g. `flat-table`, `arm-raise`, `shake`, `scream`).
2. Tap **Record 5 s**.
3. Move the device or perform the gesture during the 5-second countdown.
4. When finished, a JSON file will be automatically downloaded:
   `ghost-recording-<label>-<timestamp>.json`

Export schema conforms to `@haunt-kit/protocol`:

```json
{
  "meta": {
    "label": "table-flat",
    "os": "iOS",
    "browser": "Safari",
    "sampleRateHz": 60.0,
    "recordedAt": "2026-11-17T16:00:00.000Z"
  },
  "samples": [
    {
      "t": 16,
      "ax": 0.012,
      "ay": -0.025,
      "az": 9.805,
      "linearAx": 0.001,
      "linearAy": -0.002,
      "linearAz": 0.003,
      "gx": 0.0,
      "gy": 0.0,
      "gz": 0.0,
      "alpha": 182.4,
      "beta": 0.2,
      "gamma": -0.1,
      "rms": 0.012
    }
  ]
}
```

Saved recordings can be copied to the `recordings/` folder for sensor replay and property testing.
