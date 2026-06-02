/**
 * Eleventy rebuild trigger via file touch.
 * The Eleventy `--watch` process picks up the touch and rebuilds in ~0.6s.
 * Safe to call multiple times in quick succession — chokidar debounces.
 * @module build/trigger
 */

import { utimes, open, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function triggerRebuild(application) {
  const triggerPath = application.donationConfig?.rebuildTrigger;
  if (!triggerPath) {
    console.warn("[Donation] no rebuildTrigger configured; skipping touch");
    return;
  }
  const now = new Date();
  try {
    await utimes(triggerPath, now, now);
  } catch (err) {
    if (err.code === "ENOENT") {
      // Create the file (and parent dir) on first run.
      try {
        await mkdir(dirname(triggerPath), { recursive: true });
        const fh = await open(triggerPath, "w");
        await fh.close();
        await utimes(triggerPath, now, now);
      } catch (createErr) {
        console.error(`[Donation] rebuild trigger create failed: ${createErr.message}`);
      }
    } else {
      console.error(`[Donation] rebuild trigger touch failed: ${err.message}`);
    }
  }
}
