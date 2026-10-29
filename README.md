# Shuttle Score 🏸

A badminton scoreboard for your phone. Tap a side to give it the point, and Shuttle Score keeps the rules, the service courts and the umpire calls straight for you.

I created this as I was constantly forgetting the score whenever I was playing.

## Features
- **Singles and doubles**, best of 3 or one game
- **Proper BWF scoring:** rally point to 21, win by 2 from 20-all, capped at 30; the game winner serves first next game
- **Who serves, from where, to whom:** "Jun Hao serves from the left court to William", including the full doubles service rotation
- **Game point and match point** tags, the **interval at 11**, and **changing ends** after each game and at 11 in the decider (the sides swap on screen)
- **Umpire voice calls** (optional): "Love all, play", "Service over, 5, 3", "20 game point 18"
- **Undo** for mis-taps, and a match in progress survives a reload
- **Recent matches** history, saved on your phone
- **Built for courtside:** big tap targets, keeps the screen awake, no pull-to-refresh or tap flashes, works offline and can be added to your home screen
- Keyboard scoring on a laptop: ← / → score the side shown there, Z undoes

## How it works
- **The rules are pure functions** in `src/lib/rules.ts`: `rally(state, side)` returns the next match state, so the UI never decides anything about badminton. Undo is a stack of previous states.
- **Doubles service rotation:** when the serving side wins a rally, the same player serves again and the partners swap courts; when the receiving side wins, they take the serve without moving, and the server is whoever stands in the court their score points to (even = right). The tests walk through the BWF's own example sequence.
- **Tested:** game and match wins, deuce and the 30-point cap, the interval and change of ends, singles service courts, the doubles rotation, game and match point, and the umpire calls (`npm test`).

## Tech
TypeScript · Vite · Vitest · no framework · Web Speech API · Screen Wake Lock · service worker for offline

## Run it
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # production build → dist/
```
