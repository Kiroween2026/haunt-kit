# Requirements: seance-party

Owner: Viviana (built by Yadnesh while Viviana is unavailable). App: `apps/seance-party`. UI comes from `@haunt-kit/ui` (haunted theme); phone input from `@haunt-kit/host-sdk`.

**User story:** As a group of friends (or one judge on their own), I want a party game where our phones are the controllers, so that we can play together with nothing to install.

## 1. Lobby

1. The big screen shows a QR code, the 4-letter room code and a link. Each player who joins appears as a `PlayerGhost` in their own color.
2. 1 to 8 players. The host presses **Start the séance**.
3. The host can add 1 to 7 AI ghost bots with easy, normal or spooky skill, remove one, or remove all.
4. Someone with no phone can join from the same computer through the desktop simulator (a link on the lobby).
5. If no relay can be reached, the app opens in **practice mode** (bots only, clearly labelled), so it always works for a judge testing alone.

## 2. Ouija Planchette (60 s)

1. Everyone's tilt is averaged to move one planchette over a board of 26 letters. The average always stays inside the board.
2. Resting on a letter for 1 s picks it. A letter can't be picked again until the planchette leaves it (double letters need a step off and back).
3. The team spells a target word. Score is the letters spelled correctly, shared by everyone.

## 3. Hold Still, or the Ghost Sees You

1. The ghost looks away (dance), turns (a warning to freeze), then looks. Anyone not frozen when it looks is out.
2. Staying frozen the whole time earns nothing: points need dancing first.
3. Ends when one ghost is left, after 6 rounds, or at 90 s. Last ghost standing gets a bonus.

## 4. Banshee Scream-off

1. A 3 s countdown, then 6 s of screaming. Loudness is measured on each phone.
2. Score is the loudest average over any 2 s stretch. Rank points: loudest gets the most; ties share; silence gets 0.

## 5. Rounds and winner

1. Three games in a row, each with an intro, then a scoreboard. Then "last ghost standing".
2. Scores are never negative. A player who leaves keeps their points on the board but can never win. Ties share the win.
3. Phones always show the right view: `tilt` for Ouija, `still` for Hold Still, `scream` for Banshee, `wait` between games, each with a one-line instruction.
4. Someone who joins mid-game waits for the next game.

## 6. Bots

1. Bots produce the same input a phone does, so a game can't tell them apart from people.
2. They make human-like mistakes that depend on skill: slow reaction, wobbly aim, a missed freeze, a quieter scream.
3. One person plus bots must be able to finish a full game, even if the person does nothing.

## 7. Quality

1. Sound effects are synthesized (nothing to license). Sound starts after a click.
2. Screens follow `.kiro/steering/design.md`: AA contrast, 44 px targets, visible focus, reduced motion, one `<h1>` per screen.
3. Error states: a player drops mid-game (their slot is kept for 60 s by the relay, and they can't win if they leave), permission denied and room full (shown on the phone by the controller).
