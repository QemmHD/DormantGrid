# iPhone test plan (morning)

Nothing here has been run on a real iPhone yet. Every number in the repo comes from headless Chromium with software GL. Please run these steps in order and send back the device report from step 3.

## 0. Get a live URL (one-time)
Do one of these two:
- **Cloudflare (full game: accounts, cloud saves, co-op).**
  1. Add the repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
  2. Make sure the account has a workers.dev subdomain (Workers & Pages → Overview).
  3. Re-run the "Deploy (Cloudflare)" workflow on `main`.
  4. The live URL is printed in the run summary (`https://dormant-grid.<subdomain>.workers.dev`).
- **GitHub Pages (offline-only fallback).**
  1. In the repo, go to Settings → Pages → Source and choose **GitHub Actions**.
  2. Re-run "Deploy fallback (GitHub Pages)".
  3. The URL is `https://qemmhd.github.io/Random-stuff-/`.
  4. Saves stay on the phone; no accounts or co-op.

## 1. Install
1. Open the URL in **Safari** (not an in-app browser).
2. Tap Share → **Add to Home Screen** → Add.
3. Launch from the Home Screen icon.
   - **Expected:** a dark splash, then the boot bar with tips, then the main menu over a slowly orbiting live town.
4. Hold the phone in portrait.
   - **Expected:** "Turn your phone sideways."
5. Rotate to landscape.
   - **Expected:** the game fills the screen with no white bars and no address bar.

## 2. Account (Cloudflare build only)
1. Tap **New Game**.
   - **Expected:** a "Pick your name" dialog.
2. Enter a username and tap **Claim name**.
   - **Expected:** a recovery code is shown once. Screenshot it.
3. Close the app fully (swipe up), then reopen it.
   - **Expected:** no login screen, and the menu shows **Continue** with your name.

## 3. Performance
1. Settings → **Show performance overlay** on.
2. Walk around Haven for 2 minutes, then sprint into Old Downtown (follow the road east).
3. Note the fps, frame ms, calls and tris.
4. Tap **Copy device report** and paste it into a note or message for Claude.
5. Leave it running for 10 minutes. Watch for a reload or black screen; that would be the iOS memory kill or WebGL context loss.
   - **Expected:** the game recovers with a "Graphics restored" toast, or never reloads.
6. **Budgets to compare against:**

   | Measure | Budget |
   |---|---|
   | fps on recent iPhones | ≥ 30, aim for 60 |
   | Calls | ≤ 150 |
   | Tris | ≤ 300k |
   | Texture MB | ≈ 0 (vertex colors only) |
   | Heap | n/a on Safari |

7. If it is slow, try Settings → Graphics → Low, and Battery saver (30 fps cap).

## 4. Controls feel
1. Left thumb anywhere on the left half: a floating stick appears and you walk.
2. Right half swipe: the camera orbits. Check that sensitivity feels right (Settings → Look sensitivity).
3. Hold the **hand** button next to a crate: a ring fills, the crate breaks, and chips fly to you with a chime.
4. Tap the **attack** button near a crate.
   - **Expected:** a swing, hitstop and shake.
5. Tap **dodge** and **jump**. Toggle **sprint** (the lightning button glows amber).
6. Settings → **Left-handed layout**.
   - **Expected:** the buttons move to the left side.

## 5. Vertical slice (about 20–30 minutes)
Follow the on-screen hints:
1. Break crates and rubble.
2. Open the inventory (bag icon).
3. Crafting (diamond icon) → craft a **Crowbar**.
4. Salvage a building wall or door.
5. Build mode (house icon, or **B**) → place a foundation, 3 walls and a roof.
6. Craft a bed (it's a station in the build bar) and place it.
7. Wait for night (or set the day length shorter in Settings), tap the bed to sleep, and wake at 06:30.

Expected throughout: sound on every action, no stuck UI, and the HUD meters drain slowly.

## 6. Survivors, Grid and combat
1. Talk-walk past the three Haven survivors: they should bark lines.
2. Open the Ledger (people icon) and assign a job.
3. Open the map, pick a red node in Old Downtown and walk there. Machines may notice you.
4. At the node:
   1. Tap Interact to start the reboot.
   2. Find the 3 relays (red lights), and hold Interact at each one.
   3. Hold at the node to sync.
   4. Survive the waves.
   - **Expected:** a cyan beam, a music swell and the district banner. Windows light up street by street.

## 7. Resume and saves
1. Mid-game, swipe to the Home Screen. Wait 1 minute, then return.
   - **Expected:** it resumes within a few seconds and the world is intact.
2. Force-quit and reopen, then tap Continue.
   - **Expected:** same place, same inventory.
3. Settings → Export save.
   - **Expected:** a JSON download or copy works.

## 8. Co-op (Cloudflare build, two phones)
1. Phone A: Menu → Co-op → Host. Share the link.
2. Phone B: open the link, then Join.
   - **Expected:** each player sees the other walking around.
   - **Expected:** a crate broken on A disappears on B.
   - **Expected:** a ping (Co-op screen buttons) shows a colored beam on both phones.
3. Lock phone B for 30 seconds, then unlock.
   - **Expected:** "reconnecting", then back in the run.

Report anything odd with the device report attached.
