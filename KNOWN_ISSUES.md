# Known issues

- No real-device iPhone testing yet. All performance numbers are headless counters.
- Upper floors of enterable buildings can't be reached (no stairs in ruins yet).
- Small props are hidden at low quality (prop density 0.55), so they can't be salvaged on that tier.
- Worldgen (~0.4 s on desktop) and chunk meshing (3–13 ms per chunk) run on the main thread. This may hitch on older iPhones.
- Enemies, raids, Grid node reboots, farming interactions and faction trade are implemented in the sim but not yet hooked into the client. See PROGRESS.md.
