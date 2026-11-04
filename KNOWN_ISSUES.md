# Known issues

- **Not tested on a real iPhone.** All performance numbers are headless counters.
- **No live URL.** Cloudflare secrets are missing and GitHub Pages is not enabled. See PROGRESS.md.
- **Upper floors of enterable ruins are unreachable** (no stairs in ruins).
- **Small props are hidden at low quality** (density 0.55), so they can't be salvaged on that tier.
- **Survivors steer in straight lines** with collision push-out, so they can get stuck on corners. Nav-grid pathing is next.
- **Worldgen runs twice at boot.** It runs on the main thread (~0.4 s on desktop) and again in the mesh worker. The duplication is deliberate but costs boot time.
- **Not hooked into the client yet:** stealth, trap triggers, livestock, hunting, contracts, endings. The sim logic exists. Raids don't damage placed pieces, and survivor guards don't fight in-world.
- **Co-op limitations:**
  - Host migration on the client is a guess.
  - The server's proposed `{t:'host'}` message is not in the contract yet.
  - In-world two-client play has not been verified.
- **String lights look too large** at very close camera distances.
- **The account and co-op screens** keep their strings in `net/strings.ts`, not `ui/strings.ts`.
