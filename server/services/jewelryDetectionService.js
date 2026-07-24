// Service: uses fal.ai's vision-capable model to look at an uploaded jewelry
// product photo and classify it — which category it belongs to (or which
// category the PRIMARY piece belongs to, if the photo shows a matching set
// with multiple pieces) and a short catalog-friendly name. Used by the Admin
// Panel to auto-fill the Name/Category fields the moment an image is chosen,
// so the admin doesn't have to identify pieces manually.

import { fal } from "@fal-ai/client";

const VALID_CATEGORIES = ["necklace", "earrings", "nose-ring", "maang-tikka", "bangle", "ring"];

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set in the server environment.");
  fal.config({ credentials: key });
  configured = true;
}

const DETECTION_PROMPT =
  `Look at this jewelry product photo. It may show a single piece, or a full matching set with several ` +
  `pieces photographed together (e.g. a necklace alongside its matching earrings and a maang tikka).\n\n` +
  `CRITICAL: Only list a piece type if you can ACTUALLY SEE it in the image with your own eyes. Do not assume ` +
  `a "set" includes pieces just because sets often do — most photos show ONLY ONE piece. If you only see a ` +
  `necklace and nothing else, your answer must have exactly one entry: necklace. Never invent, guess, or add ` +
  `pieces that are not visibly present in the photo, even if they'd typically be sold as part of a matching set.\n\n` +
  `1. Identify every distinct jewelry piece type ACTUALLY VISIBLE in the photo, from this list only: ` +
  `${VALID_CATEGORIES.join(", ")}.\n` +
  `2. For EACH piece type you actually saw, write a short, natural product name (4-8 words) describing that ` +
  `specific piece's style (e.g. "Ruby Kundan Bridal Necklace") — one name per category, describing only that ` +
  `piece.\n` +
  `3. If more than one piece type is visible, pick your best guess at which is the PRIMARY/main product — this ` +
  `is just a starting suggestion, a human will confirm or override it.\n\n` +
  `Respond with ONLY a JSON object, no other text, in exactly this shape:\n` +
  `{"suggestedPrimary": "<one of: ${VALID_CATEGORIES.join(", ")}>", ` +
  `"pieces": [{"category": "<category>", "name": "<short product name for this piece>"}, ...]}`;

/**
 * @param {string} imageUrl - a URL fal.ai's model can fetch (already resolved,
 *   not a localhost/data URI — the caller is responsible for that).
 * @returns {Promise<{ suggestedPrimary: string, pieces: { category: string, name: string }[] }>}
 *   `pieces` has one entry per distinct jewelry category detected in the photo,
 *   each with its own name — the caller (Admin Panel) lets a human pick which
 *   one is actually the product being catalogued, since that's a judgment call
 *   the image content alone can't reliably answer.
 */
export async function detectJewelryFromImage(imageUrl) {
  ensureConfigured();

  const result = await fal.subscribe("fal-ai/any-llm/vision", {
    input: {
      model: "google/gemini-flash-1.5",
      prompt: DETECTION_PROMPT,
      image_url: imageUrl
    },
    logs: false
  });

  const rawText = result?.data?.output ?? "";
  const parsed = extractJson(rawText);

  const pieces = Array.isArray(parsed?.pieces)
    ? parsed.pieces
        .filter((p) => p && VALID_CATEGORIES.includes(p.category) && typeof p.name === "string" && p.name.trim())
        .map((p) => ({ category: p.category, name: p.name.trim() }))
    : [];

  if (pieces.length === 0) {
    throw new Error("Could not confidently detect a jewelry category from this image.");
  }

  const suggestedPrimary = VALID_CATEGORIES.includes(parsed?.suggestedPrimary)
    ? parsed.suggestedPrimary
    : pieces[0].category;

  return { suggestedPrimary, pieces };
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
