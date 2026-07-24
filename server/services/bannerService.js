// Service: picks a random studio-photoshoot backdrop for AI try-on generations.
// Backdrops live as static files in server/public/banners and are served over
// HTTP at /banner-images/<filename> — same static-serving pattern as jewelry.

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNERS_DIR = path.join(__dirname, "..", "public", "banners");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

let cachedFilenames = null;

async function listBannerFilenames() {
  if (cachedFilenames) return cachedFilenames;

  const entries = await fs.readdir(BANNERS_DIR);
  cachedFilenames = entries.filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));
  return cachedFilenames;
}

/**
 * Returns a publicly-servable URL (relative to this server) for a randomly
 * chosen backdrop image, or null if the banners directory is empty.
 */
export async function pickRandomBannerUrl(baseUrl) {
  const filenames = await listBannerFilenames();
  if (filenames.length === 0) return null;

  const chosen = filenames[Math.floor(Math.random() * filenames.length)];
  return `${baseUrl}/banner-images/${chosen}`;
}
