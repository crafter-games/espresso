# espresso

A dotframe game. Run `dotframe skills get core` before changing anything; it explains the edit, sim, snap, replay loop.

- Game logic: `src/game.ts` (pure state, `step`, `render`). The sim contract: `sim.ts`.
- Check a change: `dotframe sim --mash 7 --frames 600 --json`, then `dotframe snap --frame 300 --mash 7`.
- Golden replays: `replays/*.json`, verified by `bun run test` (`bun test` is Bun's test runner and skips the script).

- Until dotframe ships the Canvas 2D fallback (crafter-games/dotframe#39), `node_modules/dotframe` is a symlink to `~/Programming/crafter-games/dotframe` on branch `feat/canvas2d-fallback`. After the release: `bun add dotframe@<version>` and drop the link.
- Ship to crafter.run: `dotframe build web`, then copy `dist/web/{index.html,main.*.js,assets}` to `crafter.run/apps/web/public/events/hot-reload/espresso/`.
