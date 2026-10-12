# espresso

A dotframe game. Run `dotframe skills get core` before changing anything; it explains the edit, sim, snap, replay loop.

- Game logic: `src/game.ts` (pure state, `step`, `render`). The sim contract: `sim.ts`.
- Check a change: `dotframe sim --mash 7 --frames 600 --json`, then `dotframe snap --frame 300 --mash 7`.
- Golden replays: `replays/*.json`, verified by `bun run test` (`bun test` is Bun's test runner and skips the script).

- `dotframe` comes from npm (0.3.3+ has the Canvas 2D fallback). Install with `--registry https://registry.npmjs.org` so `bun.lock` stays off the Vercel mirror.
- Ship to crafter.run: `dotframe build web`, then copy `dist/web/{index.html,main.*.js,assets}` to `crafter.run/apps/web/public/events/hot-reload/espresso/`.
