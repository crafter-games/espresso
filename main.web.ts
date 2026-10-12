import { publishProbe } from "dotframe/src/probe-web";
import { loadBytes, run } from "dotframe/src/web/run";
import { loadFonts } from "./src/fonts";
import { WINDOW } from "./src/game";
import { createSetup } from "./src/setup";

// ?mash=<seed> lets a scripted player press random inputs.
const mash = new URLSearchParams(location.search).get("mash");

await run(
  WINDOW,
  createSetup({
    mash: mash === null ? null : Number(mash),
    onProbe: publishProbe,
    fonts: (draw, gpu) => {
      loadFonts(draw, loadBytes, (bytes, smooth) => gpu.createImage(bytes, smooth)).catch((error: unknown) => console.error(error));
    },
  }),
  { fit: "window" },
);
