# Testing Haunt Kit (for judges)

You don't need friends, an app install, or even a phone. Pick the way that fits you.

> Live URLs: _filled in after deploy (see README)._ Everything below also works locally (see the end of this page).
>
> Team note (remove before submitting): sections A to C describe the finished apps. Séance Party bots and Steady are being built until Nov 29; the simulator, controller and dot demo work today. Re-check every step on Sun Nov 29.

## A. Alone with no phone (2 minutes)

1. Open **Séance Party** on your computer. A room code and a QR code appear.
2. Click **Add bots** and choose 3 ghost bots. They play like real players.
3. In a second browser tab, open the **phone controller** link shown under the QR code, then click **Play without a phone**.
4. Type the room code and join. Move the mouse to tilt, press **S** to shake, **H** to hold still, **Space** to tap. If you allow the mic, shout to play Banshee Scream-off.
5. Press **Start** in the first tab.

## B. Alone with one phone (3 minutes)

1. Open **Séance Party** on your computer and add 2 or 3 bots.
2. Scan the QR code with your phone's camera. Tap **Enter the séance** and allow motion and microphone.
   - On iPhone: if Safari doesn't ask, close the tab and scan again.
3. Start the game. Tilt the phone to steer the planchette.

## C. Steady (one phone, 2 minutes)

1. Open **Steady** on your phone.
2. Read the disclaimer (not a medical device), pick **Shoulder raise**, tap **Start**.
3. Hold the phone in your hand at your side for 2 seconds, then raise your arm forward 5 times. Steady counts out loud and shows the angle.
4. Open **Report** to see the summary for a therapist. Nothing is uploaded; history stays on the phone.

## D. With friends (best)

Everyone scans the QR code on the big screen. Up to 8 players. If someone's screen locks, they come back as the same ghost.

## Run it locally instead

```bash
git clone https://github.com/Kiroween2026/haunt-kit.git && cd haunt-kit
corepack enable && pnpm install
pnpm dev:relay & pnpm dev:controller & pnpm dev:demo
```

Open `http://localhost:5181` and click **Add ghost player**, and open `http://localhost:5180/sim.html` to join with the keyboard and mouse. For a real phone you need HTTPS: `cloudflared tunnel --url http://localhost:5180`, then open the dot demo with `?play=https://<tunnel>.trycloudflare.com`.

## Something not working?

| You see                       | Do this                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "Motion is blocked" on iPhone | Close the tab and scan again, tap **Allow**. Or Settings → Apps → Safari → Advanced → Website Data, remove the site. |
| "This page needs HTTPS"       | Use the https:// link, not an IP address.                                                                            |
| "Room not found"              | Check the 4 letters on the big screen. Rooms close 2 minutes after the big screen is closed.                         |
| Scream doesn't count          | Reload and allow the microphone.                                                                                     |
