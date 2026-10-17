import { config } from "../config.ts";
import type { Engine } from "../types.ts";
import { aceStepEngine, aceStepHealthy } from "./acestep.ts";
import { synthEngine } from "./synth.ts";

/** ENGINE=auto uses ACE-Step whenever its API is up, else the built-in synth. */
export async function pickEngine(name: string = config.engine): Promise<Engine> {
  if (name === "synth") return synthEngine;
  if (name === "acestep") return aceStepEngine;
  return (await aceStepHealthy()) ? aceStepEngine : synthEngine;
}
