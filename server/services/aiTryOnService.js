// Service: talks to fal.ai's nano-banana/edit model to composite jewelry onto
// a user's photo. Knows nothing about HTTP/Express — pure business logic that
// a controller (or a test) can call directly.

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";
import { TryOnResult } from "../models/tryOnRequest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JEWELRY_DIR = path.join(__dirname, "..", "public", "jewelry");

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error("FAL_KEY is not set in the server environment.");
  }
  fal.config({ credentials: key });
  configured = true;
}

// Catalog jewelry photos rarely change once uploaded, but every generation was
// re-reading the file from disk and re-uploading it to fal's CDN from scratch —
// pure wasted latency on every single try-on after the first. Caching the
// resolved fal.media URL per source image (in-memory; resets on server
// restart, which is fine since the underlying files are static) skips that
// upload entirely on repeat selections, which is the majority of real usage
// (same product tried against multiple photos, or regenerated).
const resolvedUrlCache = new Map();

/**
 * fal.ai's models run in the cloud and cannot fetch `http://localhost:...` URLs —
 * only publicly reachable ones. The client sends jewelry image URLs pointing at
 * our own local dev server, so we resolve those back to a file on disk and
 * re-upload the bytes to fal's own CDN (fal.storage), which returns a URL their
 * models CAN fetch. A real https:// URL (e.g. a future production CDN) is passed
 * through unchanged.
 */
async function resolveToFalReachableUrl(imageUrlOrDataUri) {
  // User photos are unique per request (a fresh upload/capture each time) —
  // never cache these, only the stable catalog jewelry images below.
  if (imageUrlOrDataUri.startsWith("data:")) {
    const blob = dataUriToBlob(imageUrlOrDataUri);
    return fal.storage.upload(blob);
  }

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(imageUrlOrDataUri);
  if (!isLocalhost) {
    return imageUrlOrDataUri;
  }

  const cached = resolvedUrlCache.get(imageUrlOrDataUri);
  if (cached) {
    return cached;
  }

  const filename = path.basename(new URL(imageUrlOrDataUri).pathname);
  const filePath = path.join(JEWELRY_DIR, filename);
  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: guessMimeType(filename) });
  const uploadedUrl = await fal.storage.upload(blob);

  resolvedUrlCache.set(imageUrlOrDataUri, uploadedUrl);
  return uploadedUrl;
}

function dataUriToBlob(dataUri) {
  const [meta, base64] = dataUri.split(",");
  const mimeMatch = meta.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  const buffer = Buffer.from(base64, "base64");
  return new Blob([buffer], { type: mimeType });
}

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

// Per-category placement + fit guidance. Each instruction gives the model a
// concrete real-world size reference (e.g. "no wider than the neck's own
// width") instead of a vague "scale it appropriately" — vague scale wording is
// what causes oversized/cartoonish results, because the model tends to keep
// the jewelry close to its product-photo proportions rather than rescaling it
// to this specific person's body. An explicit anatomical yardstick fixes that.
const CATEGORY_INSTRUCTIONS = {
  necklace:
    "the necklace worn around the neck, its chain/collar following the exact curve of the neck and " +
    "collarbone. CRITICAL SIZE CONSTRAINT — measure against the FACE, not the frame: the necklace's " +
    "pendant must be visibly smaller than the person's own nose-to-chin distance, and the necklace's " +
    "total width must never exceed the width of the person's jawline. This rule applies identically " +
    "whether the photo is a tight close-up crop or a distant full-body shot — a closer crop must NOT " +
    "make the jewelry render bigger; only the person's face and body set the scale, never the camera's " +
    "zoom level or how much of the frame they fill. If unsure, size it smaller rather than larger. The " +
    "pendant hangs naturally with gravity over the chest and any clothing underneath it (never floating " +
    "in front of or behind fabric it should rest on)",
  earrings:
    "the earrings hanging from both earlobes. CRITICAL SIZE CONSTRAINT — measure against the FACE, not " +
    "the frame: each earring's total length must be shorter than the person's own nose-to-chin distance, " +
    "never reaching down past the chin or neck. This rule applies identically whether the photo is a " +
    "tight close-up crop or a distant full-body shot — a closer crop must NOT make the earrings render " +
    "bigger; only the person's actual face size sets the scale, never the camera's zoom level. " +
    "Symmetrically sized and angled to match each other, occluded correctly behind hair strands that " +
    "fall in front of the ear",
  "nose-ring":
    "the nose ring/nath pierced through and resting against the nostril, sized to the nose (a few " +
    "millimeters to a couple centimeters at most), matching the angle the nostril is photographed at",
  "maang-tikka":
    "the maang tikka's chain following the center hair parting with its pendant resting at the center " +
    "of the forehead just above the eyebrows, sized proportional to the forehead, not larger than the " +
    "space between the eyebrows and hairline",
  bangle:
    "the bangle(s) worn around the wrist, sized to the wrist's actual diameter as seen in the photo " +
    "(it must sit snugly against the skin, not loosely oversized), following the wrist's curvature and " +
    "partially occluded by the hand/arm where the wrist turns away from camera",
  ring:
    "the ring worn on a finger, sized to that finger's actual width (it must look proportional to a " +
    "real finger, not oversized), sitting at the correct knuckle position and following the finger's " +
    "curvature and taper"
};

// Human-readable names for every piece a reference photo might contain, used
// when telling the model to apply a full multi-piece set.
const CATEGORY_LABELS = {
  necklace: "necklace",
  earrings: "earrings",
  "nose-ring": "nose ring",
  "maang-tikka": "maang tikka",
  bangle: "bangle",
  ring: "ring"
};

function buildPrompt(jewelryCategory, jewelryName) {
  const categoryLabel = CATEGORY_LABELS[jewelryCategory] || jewelryCategory;
  const allPlacements = Object.entries(CATEGORY_INSTRUCTIONS)
    .map(([cat, instr]) => `  • ${CATEGORY_LABELS[cat]} present: add ${instr}.`)
    .join("\n");

  return (
    `You are compositing real jewelry onto a real photo for a virtual try-on. Edit the first image ` +
    `(a photo of a person) by adding jewelry from the second image (a product photo) so the result is ` +
    `indistinguishable from a genuine photograph of this exact person actually wearing this exact jewelry.\n\n` +

    `WHICH PIECES TO USE: The second image was catalogued as a "${categoryLabel}" product photo` +
    `${jewelryName ? ` named "${jewelryName}"` : ""}. It may show a SINGLE piece, or a complete MATCHING SET ` +
    `photographed together (e.g. a necklace shown alongside its matching earrings, or a set with a maang tikka). ` +
    `Look carefully at everything present in the second image and apply EVERY distinct jewelry piece shown in it ` +
    `— not just the ${categoryLabel} — each to its own correct body location, all at once, so the person appears ` +
    `to be wearing the complete set exactly as photographed together. Use these placement rules for whichever ` +
    `pieces are actually present in the reference image:\n${allPlacements}\n\n` +

    `Match each piece's exact design, metal color/tone, gemstones, and texture from the reference — do not ` +
    `simplify, restyle, or substitute a generic version of any piece.\n\n` +

    `REALISM REQUIREMENTS:\n` +
    `- SIZE IS THE MOST COMMON MISTAKE — avoid it: real jewelry is small relative to a person's body. Scale every ` +
    `piece to THIS specific person's actual body proportions in THIS photo (their real neck/ear/finger/wrist size), ` +
    `never to the product photo's own scale or aspect ratio. A common failure is rendering jewelry too large/bulky ` +
    `— when in doubt, size it smaller and more delicate, matching how the piece would look in a real jewelry-store ` +
    `photo of someone wearing it, not an oversized costume prop.\n` +
    `- SCALE MUST BE FRAME-INDEPENDENT: whether the input photo is a tight close-up (face fills most of the frame) ` +
    `or a distant full-body shot (face is small in the frame), the jewelry's size relative to the person's actual ` +
    `anatomy must be IDENTICAL in both cases. Never let a closer camera crop make the jewelry look bigger — only ` +
    `the person's real face/neck/hand size sets the scale, never how zoomed-in the photo is.\n` +
    `- Rotate/warp each piece to match the exact head, neck, or body angle the person is photographed at — it must ` +
    `follow their pose, not face the camera flatly if they're turned.\n` +
    `- Render a soft contact shadow where each piece touches skin or clothing, and a subtle highlight that matches ` +
    `the photo's existing light direction and color temperature.\n` +
    `- Preserve correct depth/occlusion: hair, clothing, chin, or other body parts that would naturally overlap a ` +
    `piece in real life must still overlap it in the result.\n\n` +

    `DO NOT CHANGE anything else: keep the person's face, body, pose, skin tone, hair, outfit, background, and ` +
    `lighting completely identical to the original photo. Output only the composited photo.`
  );
}

/**
 * Generates a photorealistic try-on image by editing the user's photo to add
 * the given jewelry piece, via fal.ai's nano-banana/edit (Gemini 2.5 Flash Image) model.
 *
 * @param {import("../models/tryOnRequest.js").TryOnRequest} tryOnRequest
 * @returns {Promise<TryOnResult>}
 */
export async function generateTryOnImage(tryOnRequest) {
  ensureConfigured();

  const prompt = buildPrompt(tryOnRequest.jewelryCategory, tryOnRequest.jewelryName);

  const [userPhotoUrl, jewelryPhotoUrl] = await Promise.all([
    resolveToFalReachableUrl(tryOnRequest.userPhoto),
    resolveToFalReachableUrl(tryOnRequest.jewelryPhoto)
  ]);

  const result = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt,
      image_urls: [userPhotoUrl, jewelryPhotoUrl]
    },
    logs: false
  });

  const generatedImage = result?.data?.images?.[0];
  if (!generatedImage?.url) {
    throw new Error("fal.ai did not return a generated image.");
  }

  return new TryOnResult({
    imageUrl: generatedImage.url,
    requestId: result.requestId
  });
}
