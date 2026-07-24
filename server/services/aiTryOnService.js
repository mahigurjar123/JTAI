// Service: talks to fal.ai's nano-banana/edit model to generate a premium
// photoshoot-style photo wearing precise replicas of the selected jewelry.
// The person's FACE and BODY (physique, skin tone) are locked to an exact
// match against their uploaded photo, but pose, outfit (styled into an
// elegant saree/lehenga if not already wearing one), and background are
// freely composed for a photoshoot look. Knows nothing about HTTP/Express —
// pure business logic that a controller (or a test) can call directly.

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";
import { TryOnResult } from "../models/tryOnRequest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JEWELRY_DIR = path.join(__dirname, "..", "public", "jewelry");
const BANNERS_DIR = path.join(__dirname, "..", "public", "banners");

// Maps a local static-file URL prefix (as served by server.js) to the disk
// directory it's actually mounted from, so resolveToFalReachableUrl reads the
// right file regardless of which local static route the URL came from.
const LOCAL_STATIC_ROUTES = [
  { prefix: "/jewelry-images/", dir: JEWELRY_DIR },
  { prefix: "/banner-images/", dir: BANNERS_DIR }
];

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

  const pathname = new URL(imageUrlOrDataUri).pathname;
  const route = LOCAL_STATIC_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (!route) {
    throw new Error(`Unrecognized local static file URL: ${imageUrlOrDataUri}`);
  }

  const filename = path.basename(pathname);
  const filePath = path.join(route.dir, filename);
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

// Per-category placement + a single concrete size yardstick (e.g. "smaller
// than nose-to-chin distance") instead of a vague "scale it appropriately".
// Kept short deliberately — the old wording repeated the same size warning
// 2-3 times per category across a very long prompt, which diluted rather than
// reinforced it once the prompt also grew background/pose instructions. One
// crisp measurable rule per category, stated once, is what the model actually
// follows.
const CATEGORY_INSTRUCTIONS = {
  necklace:
    "the chain/collar sits snugly against the base of the neck and collarbone — hugging the neck's actual " +
    "curve like a real necklace resting on skin, not floating above it or sitting loosely away from the " +
    "throat. The pendant then hangs straight down with gravity, centered, over the chest. REAL-WORLD SIZE " +
    "ANCHOR: the pendant is coin-sized or shirt-button-sized — never bigger than a large grape, never a " +
    "hand-sized medallion. Size: pendant " +
    "width ≤ 9% of the person's shoulder-to-shoulder width; necklace's own total width ≤ 28% of " +
    "shoulder-to-shoulder width. Never wider than the jawline. This exact fit (snug at the neck, straight-hanging " +
    "pendant) must be identical every time this same necklace is applied to any photo of any person. CLOTHING " +
    "LAYERING: if the person wears a collared/buttoned shirt, the necklace chain sits ON TOP of the collar " +
    "fabric where it crosses it, and the pendant hangs on top of the shirt/placket below the collar — the " +
    "necklace is always the topmost layer over clothing at the neckline, never cut into, tucked through, or " +
    "intersected by the collar edge or buttons. No visible glitching or blending where jewelry meets fabric. " +
    "POSE: if the head is turned far enough that the necklace's front/pendant would be barely visible, angle " +
    "the head/shoulders very slightly more toward camera (small, natural adjustment only) so the necklace is " +
    "clearly visible, the way a jewelry photoshoot subject would be posed.",
  earrings:
    "hanging from both earlobes, matching each other. REAL-WORLD SIZE ANCHOR: earrings are tiny — a " +
    "fingernail-to-thumbnail sized drop, never a hand-sized dangling ornament. Size: each earring's length ≤ half the distance from " +
    "earlobe to jaw-corner (roughly 1/6 of face height) — never reaching the chin or neck, and for most stud/small " +
    "designs much shorter than that ceiling. EQUALLY IMPORTANT — " +
    "WIDTH: this is the dimension most often rendered too large. Each earring's own width (side to side, at its " +
    "widest point — e.g. the flare of a dome/jhumka/chandbali) must be ≤ two-thirds the width of the earlobe " +
    "itself — never wider than the ear, never wider than it is tall, and never bulging " +
    "out past the jawline. If the reference photo is a wide dome/bell/jhumka shape, shrink the WHOLE piece " +
    "(dome and drops together, keeping their proportions to each other) until its width fits this rule — a " +
    "jhumka is a small delicate dome the size of a large bead, not a wide bell or umbrella shape. Occluded " +
    "correctly by any hair in front of the ear. POSE: if hair or head angle is fully hiding an ear, sweep loose " +
    "hair back slightly or angle the head a touch so both earrings are visible, as a jewelry photoshoot would.",
  "nose-ring":
    "pierced through and resting against the nostril. REAL-WORLD SIZE ANCHOR: smaller than a grain of rice. " +
    "Size: a few millimeters, matching the nostril's angle. " +
    "POSE: keep the head at an angle where the nostril and nose-ring are clearly visible, not hidden by a " +
    "fully profile or fully frontal angle that hides the piece.",
  "maang-tikka":
    "chain along the center hair parting, pendant at mid-forehead above the eyebrows. REAL-WORLD SIZE ANCHOR: " +
    "the pendant is coin-sized, never palm-sized. Size: no larger " +
    "than half the eyebrow-to-hairline gap. POSE: if hair fully covers the forehead/parting, sweep it back slightly " +
    "so the tikka's chain and pendant are visible, the way a jewelry photoshoot subject would be styled.",
  bangle:
    "around the wrist, matching the wrist's actual diameter, snug not loose, following its curvature, " +
    "partially occluded where the wrist turns from camera. REAL-WORLD SIZE ANCHOR: the band is pencil-thin " +
    "to finger-thin, never wider than two fingers stacked together. Size: the bangle's own band height (how much of " +
    "the forearm it covers, top to bottom) must be ≤ 10% of the distance from wrist to elbow — a thin " +
    "band circling the wrist, not a wide cuff or gauntlet. It must look like a delicate wrist ornament, " +
    "never a thick chunky ring-like mass swallowing the wrist.\n" +
    "STEP 0 — DECIDE: IS THIS A STACK, OR A LEFT/RIGHT PAIR? Product photos commonly show bangles/kadas two ways " +
    "— tell them apart before counting: (a) a STACK — several bangles bunched tightly together at the same spot, " +
    "clearly meant to all be worn together on one wrist (e.g. a bridal set), OR (b) a PAIR — exactly two bangles " +
    "of the same or mirrored design, shown side by side or slightly overlapping purely for the product photo, " +
    "with no wrist/arm in the shot to suggest they're stacked — this is the common way a single kada/bangle " +
    "design is photographed when it's sold as one-per-wrist. If it's a PAIR (case b), that means N = 1 (one " +
    "bangle per wrist, not two), not N = 2. If genuinely unsure, prefer treating it as a pair (N = 1) rather than " +
    "a stack — a bare-looking wrist is a smaller mistake than doubling up bangles that weren't meant to stack.\n" +
    "STEP 1 — COUNT THE REFERENCE, EXACTLY: having made that call, look at this bangle's reference image and " +
    "count the individual bangles/bracelets meant for ONE wrist. Say the number to yourself: is it 1? 2? 3? " +
    "Whatever that exact number is, call it N. Do not round up, do not add 'a few more for a fuller look', do not " +
    "guess — N is exactly what Step 0 concluded, nothing more.\n" +
    "STEP 2 — REPOSE BOTH HANDS INTO FRAME: this is a jewelry try-on photo, so showing the product on BOTH " +
    "wrists is mandatory, not optional. If the second hand/wrist is out of frame, hidden behind the body, " +
    "behind fabric/the sari pallu, or behind the other arm, REPOSE it — bring it into frame next to (or " +
    "mirroring) the first hand, in a natural two-hand pose (e.g. both hands loosely clasped together in front, " +
    "or both resting at the waist) — a small, natural adjustment, same standing position, angle, and outfit, not " +
    "a different pose. The only case where a second wrist is skipped is a genuine single-hand close-up crop " +
    "where no second arm exists anywhere in the frame at all — not merely 'a bit awkward to reach', an actual " +
    "absence of a second arm in the photo.\n" +
    "STEP 3 — APPLY EXACTLY N BANGLES TO EACH WRIST, NO MORE, NO LESS: place exactly N bangles (the number from " +
    "Step 1, same design/order/colors as the reference stack) on the first wrist, and place that SAME exact " +
    "number N on the second wrist too. Count them on the output yourself before finishing: left wrist = N, right " +
    "wrist = N, both equal, both matching the reference. Common mistakes to actively avoid: rendering N+1 or N+2 " +
    "bangles by adding extra rings/stripes that weren't in the reference; splitting the stack unevenly (e.g. 2 on " +
    "one wrist, 1 on the other); or styling only one wrist and leaving the other bare/hidden. Every one of those " +
    "is a failure — recount and fix before outputting.\n" +
    "POSE (fine-tuning once both wrists are in frame): if either wrist is angled away from camera or turned down " +
    "so its bangles wouldn't read clearly, rotate/tilt that hand slightly so the band is clearly visible in " +
    "profile, the way a jewelry photoshoot poses hands to showcase bracelets.",
  ring:
    "on a finger at the correct knuckle, matching that finger's actual width and taper — not oversized. " +
    "REAL-WORLD SIZE ANCHOR: the band and any stone together are no bigger than a small bead or a grain of " +
    "corn, sitting neatly on the finger, never covering half the finger. Size: " +
    "the ring's band height must be ≤ 35% of that finger's own width, and any stone/setting on top must not " +
    "extend past the finger's sides — it should look proportional to a real finger, not a bulky mass around it. " +
    "POSE: if the fingers are curled, fisted, or angled so the ring would be hidden or barely visible, relax " +
    "and angle the hand slightly (small, natural adjustment) so the ring is clearly visible, the way a jewelry " +
    "photoshoot poses a hand to showcase a ring."
};

// Human-readable name for the selected category, used in the prompt.
const CATEGORY_LABELS = {
  necklace: "necklace",
  earrings: "earrings",
  "nose-ring": "nose ring",
  "maang-tikka": "maang tikka",
  bangle: "bangle",
  ring: "ring"
};

const ORDINALS = ["zeroth", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const ordinal = (n) => ORDINALS[n] || `${n}th`;

/**
 * Builds the photoshoot generation prompt: pose, outfit (styled into an
 * elegant saree/lehenga if the reference photo isn't already wearing
 * traditional wear), and background are freely composed for a premium
 * editorial look — but the person's FACE and BODY (physique, skin tone) are
 * locked to an exact match against the reference photo, not just "inspired
 * by" it. Jewelry pieces are exact replicas of their reference images.
 *
 * @param {Array<{ jewelryCategory: string, jewelryName?: string }>} jewelryItems one entry per jewelry reference image, in order (starting at the 2nd overall image)
 * @param {boolean} hasFaceRef
 */
function buildPrompt(jewelryItems, hasFaceRef) {
  const pieceCount = jewelryItems.length;

  const pieceDescriptions = jewelryItems
    .map((item, idx) => {
      const imageIndex = idx + 2; // 1st overall image is always the person reference photo
      const categoryLabel = CATEGORY_LABELS[item.jewelryCategory] || item.jewelryCategory;
      const sizeRule = CATEGORY_INSTRUCTIONS[item.jewelryCategory];
      return (
        `${ordinal(imageIndex)} reference image — ${categoryLabel.toUpperCase()}` +
        `${item.jewelryName ? ` ("${item.jewelryName}")` : ""}: reproduce this exact piece as a direct, precise ` +
        `replica — same metal color, same stones/gems/enamel work, same design and silhouette, nothing ` +
        `redesigned or reinterpreted. Placement and scale: ${sizeRule}`
      );
    })
    .join("\n\n");

  const faceRefIndex = pieceCount + 2;
  const faceRefSentence = hasFaceRef
    ? ` The ${ordinal(faceRefIndex)} reference image is also a close-up of her face — use it alongside the 1st ` +
      `image as the authoritative reference for her exact facial features.`
    : "";

  const hasBangle = jewelryItems.some((item) => item.jewelryCategory === "bangle");
  const bangleNote = hasBangle
    ? " For the bangle: count the bangles stacked in its reference image and reproduce that exact same count, " +
      "evenly, on both wrists."
    : "";

  return (
    `A stunning, hyper-realistic, photorealistic photograph of a confident and elegant South Asian woman, shot ` +
    `like a premium editorial bridal/jewelry photoshoot — a freshly composed scene (pose, outfit, hair, studio ` +
    `setting) built around her.\n\n` +

    `#1 RULE — FACE + BODY IDENTITY — EXACT, NOT INSPIRED (zero tolerance): the woman in the output must be the ` +
    `EXACT SAME PERSON as the 1st reference image — immediately recognizable, not a similar-looking or "inspired ` +
    `by" person. Her FACE must match precisely: same face shape and geometry, same eyes (shape, spacing, color), ` +
    `same nose, same mouth/lips, same eyebrows, same jawline and chin, same skin tone, same skin texture (do not ` +
    `smooth, beautify, symmetrize, or idealize it into a different/more "generic model" face). Her BODY must also ` +
    `match: same body shape, build, and proportions, same skin tone on arms/neck/hands as the reference — not a ` +
    `slimmer, taller, or reshaped version of her. Only her POSE may be recomposed naturally for the photoshoot — ` +
    `a graceful medium shot, standing naturally with a defined, confident silhouette, holding her pose — instead ` +
    `of however she was standing in the reference; her actual face and physical body identity never change. If ` +
    `the face or body in your output could be mistaken for a different person than the 1st reference image, that ` +
    `is a failure — redo it.${faceRefSentence}\n\n` +

    `#2 RULE — SIZE (the most common jewelry failure): real jewelry is small, physical, and has real ` +
    `millimeter/centimeter dimensions — never a flat graphic scaled up to look "impressive." Product reference ` +
    `photos are close-ups and make jewelry look bigger than it really is — don't let that framing set the scale. ` +
    `If in doubt, render every piece smaller.\n\n` +

    `JEWELRY — she wears the following pieces, each reproduced as a direct, precise replica of its reference ` +
    `image (not a similar or reinterpreted design), worn at its correct real body location, sized and scaled ` +
    `exactly like real, physical jewelry on a real person — small and delicate, never enlarged into a bold, ` +
    `graphic-looking statement piece:\n\n${pieceDescriptions}\n\n` +
    `Real-world size anchors: a necklace pendant is coin-sized, earrings are fingernail-to-thumbnail sized, a ` +
    `bangle band is pencil-thin, a ring is finger-width, a nose-ring is a few millimeters, a maang tikka pendant ` +
    `is coin-sized.${bangleNote}\n\n` +

    `NOTHING EXTRA — ONLY the ${pieceCount} piece${pieceCount > 1 ? "s" : ""} listed above, nothing else: do not ` +
    `add any additional jewelry that wasn't listed (no extra bangles, rings, maang tikka, nose-ring, anklets, ` +
    `hair jewelry, or anything else), even if it would look more "complete" or more bridal. Any body part not ` +
    `covered by a listed piece stays bare/unadorned, exactly as it would be with no jewelry there — do not fill ` +
    `it in to round out the look.\n\n` +

    `STYLING: if the reference photo doesn't already show her in a saree/lehenga, dress her in one for this ` +
    `photoshoot — a rich, elegant silk saree or lehenga with tasteful gold embroidery, in a color that flatters ` +
    `and complements the jewelry. If she IS already in a saree/traditional outfit, keep that same garment. Style ` +
    `her hair elegantly (an updo or soft waves with a few tendrils framing her face) suited to the jewelry and ` +
    `occasion.\n\n` +

    `SETTING & LIGHT: soft, professional studio lighting from the side, creating realistic highlights and ` +
    `shadows on her skin and the jewelry. The background is softly blurred but recognizable as an opulent, ` +
    `traditional Indian heritage building or palace interior with warm amber tones — elegant interiors, rich ` +
    `fabrics, or traditional architecture, never sharp or distracting, always secondary to her and the jewelry.\n\n` +

    `CAMERA & REALISM: photorealistic, high-resolution, shot on a real camera with natural film grain and ` +
    `shallow depth of field. Capture subtle skin texture, fine facial details, and natural individual hair ` +
    `strands — sharp focus on her face and the jewelry, natural rich color palette, naturally balanced color ` +
    `reproduction, premium editorial-photoshoot aesthetic. This must read as a genuine, professionally shot ` +
    `photograph, 100% authentic — never as an AI-generated image, a 3D render, an illustration, or a flat graphic ` +
    `composite.\n\n` +

    `LAST CHECK BEFORE YOU OUTPUT — three things, all mandatory: (1) compare the face AND body against the 1st ` +
    `reference image — is this unmistakably the exact same person (same eyes, nose, mouth, jawline, skin tone, ` +
    `skin texture, body build), or did it drift into a different/more generic-looking person? (2) check every ` +
    `jewelry piece's size — does it look physically normal on a real body, or oversized like a graphic sticker? ` +
    `(3) count the jewelry in your output against the ${pieceCount} piece${pieceCount > 1 ? "s" : ""} listed above ` +
    `— is there anything extra that wasn't listed? If so, remove it. All three must pass — if any one fails, redo ` +
    `it before outputting. Output only the final photograph.`
  );
}

/**
 * Generates a premium editorial jewelry-photoshoot image via fal.ai's
 * nano-banana/edit (Gemini 2.5 Flash Image) model — face and body identity
 * locked exactly to the uploaded photo, everything else (pose, outfit,
 * background) freely styled. All selected jewelry pieces are requested
 * together in a single call, since a coherent one-shot photoshoot is the
 * natural fit for this generative style.
 *
 * @param {import("../models/tryOnRequest.js").TryOnRequest} tryOnRequest
 * @returns {Promise<TryOnResult>}
 */
export async function generateTryOnImage(tryOnRequest) {
  ensureConfigured();

  const hasFaceRef = !!tryOnRequest.faceRefPhoto;

  const prompt = buildPrompt(tryOnRequest.jewelryItems, hasFaceRef);

  const imageUrls = [
    tryOnRequest.userPhoto,
    ...tryOnRequest.jewelryItems.map((item) => item.jewelryPhoto)
  ];
  if (hasFaceRef) imageUrls.push(tryOnRequest.faceRefPhoto);

  const resolvedImageUrls = await Promise.all(imageUrls.map(resolveToFalReachableUrl));

  const result = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt,
      image_urls: resolvedImageUrls
    },
    logs: false
  });

  const generatedImage = result?.data?.images?.[0];
  if (!generatedImage?.url) {
    throw new Error("fal.ai did not return a generated image.");
  }

  return new TryOnResult({ imageUrl: generatedImage.url, requestId: result.requestId });
}
