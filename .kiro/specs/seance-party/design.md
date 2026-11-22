# Design: seance-party

```
phones ──relay──▶ host-sdk room ──▶ Party (host/party.ts) ──▶ Session (game/session.ts) ──▶ MiniGame
                                       │  InputTracker: frames/gestures → Input per player           OuijaGame
 bots ── Bot.think() → Input ──────────┘                                                            HoldStillGame
                                       └── snapshot → React screens                                  BansheeGame
```

- **`src/game/`** is pure TypeScript with no React or browser: `OuijaGame`, `HoldStillGame`, `BansheeGame`, `Session`, `Bot`, a seeded `rng`. Everything the property tests attack is here.
- A minigame reads one `Input` per player: `{ tilt: {x,y}, rms, frozen }`. A phone's input comes from its frames (tilt, rms) and the `hold-still` / `hold-still-broken` gestures (frozen). A bot produces the same object.
- **`Party`** owns the room, the bots, the `InputTracker` and the `Session`. It ticks in 33 ms steps, sends each phone's view only when it changes, flashes phones on events, and publishes a plain-data snapshot.
- **`useParty`** connects (real relay, else practice mode with the SDK's mock room), runs the clock, and re-renders on each snapshot. `?speed=N` runs the clock faster (tests and demos).
- **Phone views:** Ouija `tilt` (raw frames); Hold Still `still` (the hold-still detector runs on the phone; only events are sent); Banshee `scream` (raw frames carry `rms`); everything else `wait`.
- **Hold Still timing:** the warning (1.7 s) is longer than the detector's 1.2 s, so a player who freezes when told is registered as frozen before the ghost looks.

## Property tests

- the averaged tilt always stays in -1..1, and the planchette always stays on the board
- scores never go negative; ranks are sorted and ties share
- a player who left never wins (checked directly over random scores and leavers, and over full games)
- a game of only bots always finishes and has a winner, for any seed, 1 to 8 bots and any skill
- a quiet player never beats a loud one; an idle human plus bots still finishes
