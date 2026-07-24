// Service: talks to fal.ai's nano-banana/edit model to composite jewelry onto
// a user's photo. Knows nothing about HTTP/Express — pure business logic that
// a controller (or a test) can call directly.

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";
import { TryOnResult } from "../models/tryOnRequest.js";
import { pickRandomBannerUrl } from "./bannerService.js";

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
    "STEP 1 — COUNT THE REFERENCE, EXACTLY: look at this bangle's reference image and count the individual " +
    "bangles/bracelets stacked on that ONE wrist. Say the number to yourself: is it 1? 2? 3? Whatever that exact " +
    "number is, call it N. Do not round up, do not add 'a few more for a fuller look', do not guess — N is " +
    "exactly what is physically drawn in the reference photo, nothing more.\n" +
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
 * @param {Array<{ jewelryCategory: string, jewelryName?: string }>} jewelryItems one entry per reference image, in the same order as those images (starting at the 2nd overall image)
 * @param {boolean} hasFaceRef
 */
function buildPrompt(jewelryItems, hasFaceRef) {
  const pieceCount = jewelryItems.length;
  const isSingle = pieceCount === 1;

  // Every reference image gets its own block: which image index it is, what
  // category/product it's catalogued as, and that category's placement +
  // size rule. This is what lets one call handle N pieces worn together
  // instead of assuming exactly one jewelry image.
  const perItemBlocks = jewelryItems
    .map((item, idx) => {
      const imageIndex = idx + 2; // 1st overall image is always the person's photo
      const categoryLabel = CATEGORY_LABELS[item.jewelryCategory] || item.jewelryCategory;
      const sizeRule = CATEGORY_INSTRUCTIONS[item.jewelryCategory];
      return (
        `${ordinal(imageIndex)} IMAGE — ${categoryLabel.toUpperCase()}` +
        `${item.jewelryName ? ` ("${item.jewelryName}")` : ""}: ${sizeRule}`
      );
    })
    .join("\n\n");

  // Face reference, if supplied, always comes right after the last jewelry
  // reference image.
  const faceRefImageIndex = pieceCount + 2;
  const faceRefSection = hasFaceRef
    ? `\nFACE REFERENCE (${ordinal(faceRefImageIndex)} image): this is a close-up photo of the SAME person as the ` +
      `1st image, provided only so you can see their exact facial features more clearly. Use it ONLY to keep the ` +
      `face identity in the 1st image accurate (same eyes, nose, mouth, skin texture, face shape) — do NOT use its ` +
      `framing, crop, pose, or background. The output is built entirely from the 1st image (full photo): same ` +
      `framing, same body, same pose, same clothes, same background — just with the face identity double-checked ` +
      `against this close-up. Never output the close-up photo itself or its crop/composition.\n`
    : "";

  const hasBangle = jewelryItems.some((item) => item.jewelryCategory === "bangle");
  const bangleSelfCheck = hasBangle
    ? "For the bangle specifically: literally count the bangles on the left wrist and the right wrist in your " +
      "output — both counts must equal each other AND equal the count in its reference image, and neither " +
      "wrist may be bare or missing. "
    : "";

  const identityLock =
    "The person's face identity, body shape, skin tone, and CLOTHING are UNTOUCHED — pixel-identical to the " +
    "original photo: same exact face geometry, expression, skin texture, eye gaze, hairstyle, and the exact " +
    "same garment (same color, cut, neckline, sleeves, fabric) they are already wearing. Do not restyle, " +
    "upgrade, redesign, or swap their outfit for a different one — not even a 'nicer' or more " +
    "'photoshoot-appropriate' garment. Do not beautify, retouch, reshape, slim, smooth skin, or subtly redraw " +
    "the face or body — this must NOT look like a different, more polished version of the same person; it must " +
    "look like the literal original photo with only jewelry added. " +
    "The ONLY exception is the jewelry-visibility pose adjustment described in each piece's placement rule above " +
    "(if any) — for most jewelry this is a small nudge (tilt head, turn wrist), but for a bangle specifically it " +
    "may include bringing a hidden/out-of-frame hand into view as instructed above. Even then, keep the same " +
    "standing position, same outfit, and same overall composition — only the arm/hand position changes, nothing " +
    "else about their pose, angle, or position. The background stays exactly as it is in the original photo.";

  const editIntro = isSingle
    ? `Edit the first image (a photo of a person) to add jewelry from the second image (a product photo) — result ` +
      `must look like a real photograph of this exact person actually wearing this exact piece.`
    : `Edit the first image (a photo of a person) to add ${pieceCount} pieces of jewelry worn together, one from ` +
      `each of the following ${pieceCount} product reference images (2nd through ${ordinal(pieceCount + 1)} image) ` +
      `— result must look like a real photograph of this exact person actually wearing all of these exact pieces ` +
      `at the same time.`;

  return (
    `${editIntro} Render every piece SMALL AND REALISTIC, like an actual delicate accessory — not a large, bold, ` +
    `statement-sized graphic overlay.\n\n` +

    `#1 RULE — SIZE (the most common failure, and the one this system gets wrong most often — jewelry keeps ` +
    `coming out TOO BIG): real jewelry is small.\n` +
    `MANDATORY SHRINK CHECK — do this before rendering: each product reference image is a close-up photo, and ` +
    `close-up product photography makes jewelry look much bigger than it actually is on a real body — a ring ` +
    `photographed filling half the frame is still just a few centimeters wide on an actual finger. For every ` +
    `piece, picture the size you'd naturally render from its reference photo, then deliberately draw it noticeably ` +
    `smaller than that instinct — roughly a third smaller — using the real anatomical proportions given per piece ` +
    `below (shoulder width, earlobe size, wrist diameter, finger width) as the actual yardstick, not the product ` +
    `photo's framing/zoom. The same "smaller than you'd think" logic applies to every piece: earrings never longer ` +
    `than earlobe-to-jaw, bangles a thin band snug to the wrist's real diameter (never a cuff), rings matched to ` +
    `actual finger width, nose-rings just a few millimeters, maang tikka no bigger than the eyebrow-to-hairline ` +
    `gap. When unsure between two sizes, always pick the smaller one. This scale is identical whether the photo is ` +
    `a close-up or a distant full-body shot — never let camera zoom make a piece look bigger; only the person's ` +
    `real anatomy sets the scale.\n\n` +

    `#2 RULE — IDENTITY (equally critical, zero tolerance): treat the 1st image like an image editor layer that is ` +
    `LOCKED — every pixel of the person (face, skin, hair, body, expression) and their clothing must be copied ` +
    `into the output completely untouched, pixel-for-pixel, from the 1st image. You are NOT redrawing or ` +
    `regenerating the person at all; the ONLY new pixels anywhere in the output are the jewelry itself (plus the ` +
    `small, natural contact shadow it casts). This is a photo EDIT, not a new photo of a similar-looking person — ` +
    `if you find yourself redrawing the face, skin, or body, stop, that is wrong; those pixels come from the 1st ` +
    `image unchanged. Never beautify, retouch, smooth skin, slim the body, symmetrize the face, or improve ` +
    `anything about their appearance — an unretouched real photo with jewelry added is the goal, not a polished ` +
    `photoshoot version of the person.\n\n` +

    `WHICH PIECES — placement + size rule per reference image:\n${perItemBlocks}\n\n` +
    `Apply each reference image's piece(s) to its own body location as described above (necklace→neck, ` +
    `earrings→both ears, bangle→wrist, ring→finger, nose-ring→nostril, maang-tikka→forehead). If any single ` +
    `reference image itself shows multiple pieces bundled together (e.g. a matching set), add every piece visible ` +
    `in that image too. Do not skip any reference image, do not mix up which piece goes where, and do not add any ` +
    `piece that isn't visible in one of the reference images.\n` +
    `PRODUCT FIDELITY — copy each piece exactly as shown in its own reference image, do not design a new one: same ` +
    `metal color, same stone/gem pattern and colors, same number and arrangement of chains/strands/beads, same ` +
    `pendant/motif shape, same overall silhouette as that reference. Each must be recognizably THE SAME product ` +
    `photographed on the person, not a similar or reinterpreted piece in the same style/category. Only size and ` +
    `perspective change to fit this person and this camera angle.\n` +
    `SELF-CHECK before finalizing: compare each rendered piece against its own reference image piece by piece — ` +
    `same count of items, same count of stones/beads/chains, nothing cropped off-frame or cut in half, nothing ` +
    `duplicated that wasn't duplicated in the reference. Then check SIZE specifically, separately, for EACH piece: ` +
    `measure it against the body part it sits on using the size rule given for it above — if it looks even ` +
    `slightly large, oversized, or "statement-piece" bold rather than delicately real, shrink it further before ` +
    `outputting. Undersized is never a failure here; oversized always is. ` +
    bangleSelfCheck +
    `If any of these don't match, redo it before outputting.\n` +
    faceRefSection +
    `\nFinish: soft contact shadow + highlight matching the scene's light for every piece; correct depth so ` +
    `hair/clothing/chin overlap the jewelry wherever they naturally would. Output must read as one real photograph ` +
    `— no seams, no mismatched lighting, no AI-composite look.\n\n` +

    `DO NOT CHANGE: ${identityLock}\n\n` +

    `LAST CHECK BEFORE YOU OUTPUT — two things, both mandatory:\n` +
    `1) JEWELRY SIZE: look at every piece one final time. If any piece looks even close to dominating the body ` +
    `part it's on, or would catch someone's eye as "that looks too big," shrink it again — real jewelry is subtle ` +
    `and small, and this is the single most common mistake here.\n` +
    `2) FACE/BODY IDENTITY: put the output side-by-side against the 1st image in your mind — is this still ` +
    `unmistakably the same person, same face, same body, same skin, same clothes, with nothing softened, ` +
    `beautified, or redrawn? If anything about the person looks even slightly different from the 1st image (aside ` +
    `from the jewelry and the allowed small pose nudge), redo it — identity drift is a failure exactly as serious ` +
    `as oversized jewelry. Output only the final photo.`
  );
}

// Separate, focused prompt for the background-swap pass (step 2). Kept as its
// own AI call rather than folded into buildPrompt above: asking one call to
// both add jewelry accurately AND swap the backdrop overloaded the model and
// was the cause of jewelry coming out the wrong size/count/cropped. Isolating
// the backdrop swap to a second pass — run only after the jewelry is already
// correctly placed — keeps each call's task simple enough to get right.
function buildBackgroundSwapPrompt() {
  return (
    `This is a masked background replacement on the first image (a finished jewelry try-on photo of a person), ` +
    `using the second image as the new backdrop. Treat it exactly like editing in an image editor with the person ` +
    `selected and locked: everything inside the person's silhouette — face, skin, hair, body, pose, expression, ` +
    `clothing, and the jewelry already on them — is a FROZEN, LOCKED layer that must be copied over into the ` +
    `output completely untouched, pixel-for-pixel, from the first image. You are NOT redrawing, regenerating, or ` +
    `reinterpreting the person at all — you are only generating NEW pixels in the region OUTSIDE their silhouette ` +
    `(the background) and compositing the frozen person layer on top of it. If you find yourself redrawing any ` +
    `part of the face, skin, body, or jewelry, stop — that is wrong; those pixels come from the first image ` +
    `unchanged, not from a new render.\n\n` +

    `BACKGROUND: the new background pixels come from the second image (the backdrop) instead of the first image's ` +
    `current background. Add only a subtle ambient light/color cast at the silhouette edge so the frozen person ` +
    `layer doesn't look flatly pasted — but this is a lighting overlay at the edge, not a repaint of the person ` +
    `underneath it. Keep clean hair/clothing/jewelry edge detail against the new backdrop.\n\n` +

    `FRAMING — do not shrink the person: they must fill the exact same proportion of the frame (same crop, same ` +
    `zoom level, same headroom/edge space) as in the first image. If the backdrop has a different aspect ratio, ` +
    `crop or extend the BACKDROP to fit — never shrink, letterbox, or push the person smaller/further away.\n\n` +

    `LAST CHECK BEFORE YOU OUTPUT: compare the person region pixel-by-pixel against the first image in your mind — ` +
    `same face, same body, same skin, same jewelry, same clothes, nothing softened, beautified, or redrawn, only ` +
    `the pixels behind them are new. If anything about the person looks even slightly different, you regenerated ` +
    `instead of freezing that layer — redo it. Output only the final composited photo — no seams, no mismatched ` +
    `lighting, no AI-composite look.`
  );
}

/**
 * Generates a photorealistic try-on image by editing the user's photo to add
 * every selected jewelry piece (worn together), via fal.ai's nano-banana/edit
 * (Gemini 2.5 Flash Image) model.
 *
 * @param {import("../models/tryOnRequest.js").TryOnRequest} tryOnRequest
 * @returns {Promise<TryOnResult>}
 */
export async function generateTryOnImage(tryOnRequest) {
  ensureConfigured();

  // Face-ref stays disabled — same isolation reasoning as the backdrop split
  // below: keep each call's task simple enough for the model to get right.
  const hasFaceRef = false;

  // ── Step 1: jewelry only, original background — this call's only job is
  // accurate jewelry placement (all selected pieces at once), so nothing else
  // competes for the model's attention. ─────────────────────────────────
  const jewelryPrompt = buildPrompt(tryOnRequest.jewelryItems, hasFaceRef);

  const jewelryImageUrls = [
    tryOnRequest.userPhoto,
    ...tryOnRequest.jewelryItems.map((item) => item.jewelryPhoto)
  ];
  if (hasFaceRef) jewelryImageUrls.push(tryOnRequest.faceRefPhoto);

  const resolvedJewelryImageUrls = await Promise.all(jewelryImageUrls.map(resolveToFalReachableUrl));

  const jewelryResult = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt: jewelryPrompt,
      image_urls: resolvedJewelryImageUrls
    },
    logs: false
  });

  const jewelryImage = jewelryResult?.data?.images?.[0];
  if (!jewelryImage?.url) {
    throw new Error("fal.ai did not return a generated image.");
  }

  const backdropUrl = await pickRandomBannerUrl(`http://localhost:${process.env.PORT || 5000}`);
  if (!backdropUrl) {
    return new TryOnResult({ imageUrl: jewelryImage.url, requestId: jewelryResult.requestId });
  }

  // ── Step 2: swap only the background of the already-correct jewelry photo,
  // as its own focused call. ────────────────────────────────────────────
  const resolvedBackdropUrl = await resolveToFalReachableUrl(backdropUrl);

  const backdropResult = await fal.subscribe("fal-ai/nano-banana/edit", {
    input: {
      prompt: buildBackgroundSwapPrompt(),
      image_urls: [jewelryImage.url, resolvedBackdropUrl]
    },
    logs: false
  });

  const finalImage = backdropResult?.data?.images?.[0];
  if (!finalImage?.url) {
    // Backdrop pass failed — fall back to the accurate jewelry-only image
    // rather than losing the generation entirely.
    return new TryOnResult({ imageUrl: jewelryImage.url, requestId: jewelryResult.requestId });
  }

  return new TryOnResult({
    imageUrl: finalImage.url,
    requestId: backdropResult.requestId
  });
}
