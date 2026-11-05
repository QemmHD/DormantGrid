# Co-op two-device test (10 minutes)

**Why.** The automated co-op test runs two headless clients against the real Worker on localhost (`node tests/coop-local.mjs`). Nobody has played co-op on two real devices over the internet yet, so this checklist is for you.

**You need:**
- **Two devices.** Ideally one iPhone (Home Screen app, landscape) and one desktop browser. Two phones also work.
- **The live URL** on both: https://dormant-grid.dg-server.workers.dev (co-op does not work on the GitHub Pages fallback, which has no server).
- **The overlay.** On both devices, open Settings and turn on **Co-op diagnostics**. A small panel appears bottom-left showing:
  - state and room code
  - round-trip time
  - snapshot age
  - desyncs
  - reconnects
- **About 10 minutes.**

**Scores** are 1 to 5: 1 = broken, 3 = usable but rough, 5 = feels like one world.

**Reporting.** After each step, write the score and anything odd. When something goes wrong, tap **Copy co-op report** on both devices straight away and paste both reports into your notes. If copying is blocked on iPhone, the report appears selected under the button: long-press and copy it.

## 1. Join by code (2 min)

1. **Device A:** Menu → **Co-op** → **Host a run**. Read the 5-letter code aloud.
2. **Device B:** Menu → **Co-op**, type the code under "Or join a friend’s run", then tap **Join**.
3. Both overlays should show `online`, the room code and 2 players.

| Check | Score 1-5 | Notes |
|---|---|---|
| Joining took under 10 s and needed no retry | | |
| Each player sees the other (name tag, character) | | |
| Overlay round trip on each device (write the number) | | A: ___ ms  B: ___ ms |

Question: what did you expect to tap that you didn't find?

## 2. Move together (2 min)

Walk side by side for 30 s, then run past each other and circle a building.

| Check | Score | Notes |
|---|---|---|
| The other player moves smoothly (no teleporting or rubber-banding) | | |
| They end up where they really are (stop next to each other; do both screens agree?) | | |
| Snapshot age stays under ~300 ms while moving | | max seen: ___ ms |

Question: did the other player's running or animations look right, or did they slide?

## 3. Both gather (2 min)

Both players salvage props near each other, including the same crate at the same time.

| Check | Score | Notes |
|---|---|---|
| A prop one player breaks disappears for the other within ~1 s | | |
| Breaking the same prop at once: only one gets the loot, nothing duplicates, no error | | |
| Desyncs counter stays at 0 (write it if it rises) | | ___ |

Question: did anything appear on one screen but not the other (drops, pieces, fire)?

## 4. One disconnects and rejoins (2 min)

1. **Device B:** turn on Airplane Mode for 10 s (or switch to another app for 20 s), then turn it off or come back.
2. Watch both overlays.

| Check | Score | Notes |
|---|---|---|
| A sees B as "reconnecting", not gone | | |
| B comes back by itself (state returns to `online`, Reconnects +1) | | took ___ s |
| B's position and inventory are correct after rejoining | | |

Question: was it clear on B's screen what was happening while offline?

## 5. Save and leave (2 min)

1. Both players build one piece near each other.
2. **Device B:** Menu → **Co-op** → **Leave run**.
3. **Device A:** Menu → **Save & Quit**, reopen the game, then **Continue**.

| Check | Score | Notes |
|---|---|---|
| A sees B leave cleanly (toast, character removed) | | |
| A's world after reopening has both pieces | | |
| B's own save (solo Continue) still loads | | |

Question: should the host's world keep the guest's pieces? Did it do what you expected?

## Overall

| Question | Answer |
|---|---|
| Overall co-op feel, 1-5 | |
| Worst moment (what, when, overlay numbers) | |
| Would you play a full session together like this? Why or why not? | |
| Device + iOS version / browser on each side | |

**What the automated localhost test already covers** (`node tests/coop-local.mjs`, real Worker and Durable Objects under `wrangler dev`):
- host and join by code
- presence and movement interpolation
- a shared prop removal
- disconnect and automatic resume
- a duplicate join with the same account, where the older tab is replaced and the room stays at 2 players
- an old client version refused with `update_required`
- the overlay's numbers and its copyable report

It does **not** cover real network latency, packet loss, iOS backgrounding, or two people actually playing.
