# Testing Haunt Kit (for judges)

You don't need friends, an app install or even a phone. Pick the way that fits you. Live links:

- Séance Party: https://haunt-kit-seance.pages.dev
- Steady: https://haunt-kit-steady.pages.dev
- Phone controller (the QR code opens it): https://haunt-kit-play.pages.dev

Every step below is one our automated tests run on Safari's engine (WebKit) and Chromium.

## A. Séance Party alone, no phone (2 minutes)

1. Open **Séance Party** on your computer. If there is no relay it says **Practice mode** and still works.
2. Click **Fill to 4**. Three ghost bots join. Bots play like people: they react slowly and make mistakes.
3. Click **Start the séance**. Three games follow, about three minutes in all:
   - **Ouija Planchette:** everyone's tilt steers one planchette. Bots spell the words.
   - **Hold Still:** the ghost looks away (dance), turns (freeze), then looks. Anyone moving is out.
   - **Banshee Scream-off:** the loudest scream wins.
4. At the end you see **Last ghost standing** and the final scores. **Play again** keeps the bots.

## B. Séance Party with you in it, no phone (3 minutes)

Needs the relay: open the live link, not Practice mode. (Locally: `pnpm dev:relay`.)

1. In the lobby, click **Join from this computer**. A new tab opens.
2. Type a name and click **Join with this computer**. You appear in the lobby as a ghost.
3. Back in the lobby tab, click **Fill to 4** and **Start the séance**.
4. In your tab: **move the mouse** over the circle to tilt, press **H** to hold still, press **S** to shake, and **allow the microphone** to scream in the Banshee game.

## C. Séance Party with your phone (3 minutes)

1. Open the live link on your computer and scan the QR code with your phone's camera.
2. Tap **Enter the séance**. Allow motion and the microphone.
   - On iPhone, if Safari doesn't ask, close the tab and scan again.
3. Start the game from the computer. Tilt your phone to steer. Lock the screen for a few seconds: you come back as the same ghost.

## D. Steady, no phone (2 minutes)

1. Open **Steady**. Read the notice (not a medical device), then click **I understand**.
2. Click **Shoulder raise**, then **Try the demo (no phone needed)**.
3. A pretend person does five reps. Watch the count, the angle gauge and the advice: one rep is **Not full range** and one is **Too fast**. Turn your sound on to hear it count.
4. Click **Stop**, then **Report for my therapist**. Nothing is uploaded. **My sessions** (on the home screen) shows what is saved on this device.

## E. Steady on your phone (2 minutes)

1. Open **Steady** on your phone, pick **Shoulder raise**, tap **Start**, and allow motion.
2. Hold the phone in your hand, arm down, for 2 seconds. Then raise your arm in front of you and lower it, five times.
3. Try **Settings** on the home screen: **Voice only**, **High contrast**, and **Large** text.

## F. Add phone controls to your own app

See "Add phone controls to your app" in the [README](../README.md): `createRoom` and `createMockRoom` (fake players, no relay) take a few lines.

## Run it locally instead

```bash
git clone https://github.com/Kiroween2026/haunt-kit.git && cd haunt-kit
corepack enable && pnpm install
pnpm dev:relay          # in one terminal
pnpm dev:controller     # in another (phone page, port 5180)
pnpm dev:seance         # Séance Party, http://localhost:5183
pnpm dev:steady         # Steady, http://localhost:5184
```

For a real phone you need HTTPS: `cloudflared tunnel --url http://localhost:5180`, then open Séance Party with `?play=https://<tunnel>.trycloudflare.com`.

## Something not working?

| You see                         | Do this                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "Practice mode (no phones)"     | The relay isn't reachable. Bots still work. For phones, use the live link or run `pnpm dev:relay`.                   |
| "Motion is blocked" on iPhone   | Close the tab and scan again, tap **Allow**. Or Settings → Apps → Safari → Advanced → Website Data, remove the site. |
| "This page needs HTTPS"         | Use the https:// link, not an IP address.                                                                            |
| "Room not found"                | Check the 4 letters. A room closes 2 minutes after the big screen is closed.                                         |
| Scream doesn't count            | Reload and allow the microphone.                                                                                     |
| Steady says "no motion sensors" | You're on a computer. Click **Try the demo**.                                                                        |
| Steady doesn't speak            | Turn the sound up, and check **Count reps out loud** in Settings. iPhone only speaks after a tap.                    |
