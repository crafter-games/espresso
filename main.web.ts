import { publishProbe } from "dotframe/src/probe-web";
import { loadBytes, run } from "dotframe/src/web/run";
import { loadFonts } from "./src/fonts";
import { WINDOW } from "./src/game";
import { createSetup } from "./src/setup";

// ?mash=<seed> lets a scripted player press random inputs.
const mash = new URLSearchParams(location.search).get("mash");
const SOUNDS = ["pour", "grind", "clink", "crema", "good", "spill", "streak", "over", "start"];
const KEY = "hot-reload:espresso:best";

function best(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

await run(
  WINDOW,
  createSetup({
    mash: mash === null ? null : Number(mash),
    onProbe: publishProbe,
    fonts: (draw, gpu) => {
      loadFonts(draw, loadBytes, (bytes, smooth) => gpu.createImage(bytes, smooth)).catch((error: unknown) => console.error(error));
    },
    sounds: async (audio) => {
      const loaded: Record<string, number> = {};
      for (const name of SOUNDS) loaded[name] = await audio.loadSound(await loadBytes(`assets/sfx/${name}.mp3`));
      return loaded;
    },
    best: best(),
    saveBest: (score) => {
      try {
        localStorage.setItem(KEY, String(score));
      } catch {}
    },
  }),
  { fit: "window" },
);
