// The dotframe CLI contract: dotframe sim, snap, replay, and desync drive the game through this module.
import { defineSim, type SimPlatform, type SimRun } from "dotframe/src/sim";
import { loadFonts } from "./src/fonts";
import { checksum, createGame, encode, type Game, PLAYERS, randomInput, render, restore, snapshot, state, step, WINDOW } from "./src/game";

export default defineSim({
  players: PLAYERS,
  window: WINDOW,
  options: {},
  neutral: 0,
  rollbackWindow: 20,
  encode,
  random: randomInput,
  create: (platform: SimPlatform): SimRun => {
    let game: Game = createGame(1);
    const { draw, image } = platform;
    return {
      ready: draw && image ? loadFonts(draw, platform.load, image) : Promise.resolve(),
      start: (seed: number): void => {
        game = createGame(seed);
      },
      step: (inputs: number[]): void => step(game, inputs),
      checksum: (): number => checksum(game),
      state: (): unknown => state(game),
      // One full game: five cups and the score screen.
      over: (): boolean => game.phase === "done",
      save: (): unknown => snapshot(game),
      restore: (saved: unknown): void => restore(game, saved as Game),
      inspect: (): unknown => game,
      render: (d) => render(game, d),
    };
  },
});
