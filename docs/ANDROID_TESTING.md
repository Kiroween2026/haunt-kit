# Android testing (we own no Android phone)

Owner: Yadnesh. Android Chrome needs no motion permission prompt, so it is lower risk than iPhone Safari. The automated tests already run on Chromium (Android's browser engine) through Playwright. These two checks cover what Chromium on a desktop can't.

## 1. Android Studio emulator (anyone, 20 minutes)

1. Install Android Studio → More Actions → Virtual Device Manager → Create device → **Pixel 8**, a recent Google Play system image.
2. Start the emulator. Open **Chrome** in it.
3. On your laptop run `pnpm dev:relay`, `pnpm dev:controller`, `pnpm dev:demo` and `cloudflared tunnel --url http://localhost:5180`.
4. In the emulator's Chrome open `https://<tunnel>.trycloudflare.com/?room=<CODE>` (the code from the demo on `http://localhost:5181/?play=https://<tunnel>.trycloudflare.com`).
5. Emulator toolbar **⋯ → Extended Controls → Virtual sensors**:
   - **Device Pose → Rotate:** tilt left/right/forward. The dot on the laptop must move the same way.
   - **Additional sensors → Accelerometer:** with the device flat, Z must be about **+9.8**. After the controller normalizes it, `az` must also be about **+9.8** (check with the Séance MCP `get_sensor_snapshot`, or open the controller with `?raw=1`).
6. Write the results in the table below.

## 2. Borrowed real phone (Sat Nov 28, 15 minutes)

Open the staging controller URL (or the tunnel) on the friend's phone and tick each line:

| #   | Check                                   | Expected                                       | Result |
| --- | --------------------------------------- | ---------------------------------------------- | ------ |
| 1   | Scan the QR code                        | Opens Chrome, join screen shows the room code  |        |
| 2   | Tap **Enter the séance**                | No motion prompt (Android), mic prompt appears |        |
| 3   | Lie flat, screen up, `?raw=1`, snapshot | `az` ≈ +9.8, `ax`,`ay` ≈ 0                     |        |
| 4   | Tilt right                              | Dot moves right (`gamma` > 0)                  |        |
| 5   | Tilt toward you (top edge up)           | Dot moves the same way as on the iPhone        |        |
| 6   | Scream view                             | Meter moves, host sees `rms` rise              |        |
| 7   | Lock the screen 10 s, unlock            | Rejoins as the same player and color           |        |
| 8   | Tap view                                | Host gets `tap`                                |        |
| 9   | Desktop simulator link                  | Opens `sim.html`                               |        |

If check 3 or 5 is wrong, fix it **only** in `ACCEL_SIGN` / `normalizeSample` (`packages/host-sdk/src/device/normalize.ts`), and add a test with the real numbers you saw.

## Results

| Date | Device | Who | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | Notes |
| ---- | ------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ----- |
|      |        |     |     |     |     |     |     |     |     |     |     |       |
