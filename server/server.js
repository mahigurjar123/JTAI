// server/server.js
// JTAI Express Backend — Local-disk jewelry catalog edition
// Jewelry images are saved to server/public/jewelry and served statically;
// metadata lives in server/data/jewelry.json. This is a temporary local
// substitute for Firebase Firestore/Storage until those are enabled — see
// the commented Firebase Admin SDK wiring below for the original approach.

import express    from "express";
import cors       from "cors";
import path       from "path";
import fs         from "fs";
import { fileURLToPath } from "url";
import multer     from "multer";
import dotenv     from "dotenv";
import tryOnRoutes from "./routes/tryOnRoutes.js";
import { postDetectJewelry } from "./controllers/jewelryDetectionController.js";
// import { adminDb, adminStorage } from "./firebase/firebaseAdmin.js";
// import { FieldValue } from "firebase-admin/firestore";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Local storage paths ───────────────────────────────────────────────────
const JEWELRY_DIR = path.join(__dirname, "public", "jewelry");
const BANNERS_DIR  = path.join(__dirname, "public", "banners");
const DATA_DIR     = path.join(__dirname, "data");
const JEWELRY_DB   = path.join(DATA_DIR, "jewelry.json");

if (!fs.existsSync(JEWELRY_DIR)) fs.mkdirSync(JEWELRY_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(JEWELRY_DB)) fs.writeFileSync(JEWELRY_DB, "[]", "utf-8");

const readJewelryDb  = () => JSON.parse(fs.readFileSync(JEWELRY_DB, "utf-8"));
const writeJewelryDb = (items) => fs.writeFileSync(JEWELRY_DB, JSON.stringify(items, null, 2), "utf-8");

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
// Raised JSON limit: AI try-on requests carry two base64-encoded photos in the body.
app.use(express.json({ limit: "25mb" }));
app.use("/jewelry-images", express.static(JEWELRY_DIR));
app.use("/banner-images", express.static(BANNERS_DIR));

// ─── Multer: store jewelry images straight into public/jewelry ───────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, JEWELRY_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `j-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// In-memory multer for the AI-detection endpoint — that image is only ever
// analyzed and discarded, never persisted, so writing it to disk first would
// be pure waste.
const uploadToMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────────────────────
// JEWELRY API (local disk + JSON, permanent across restarts)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/jewelry — public active catalog */
app.get("/api/jewelry", (_req, res) => {
  try {
    const items = readJewelryDb()
      .filter((item) => item.active)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(items);
  } catch (err) {
    console.error("GET /api/jewelry:", err);
    res.status(500).json({ error: "Failed to fetch jewelry catalog." });
  }
});

/** GET /api/jewelry/admin — all items including drafts */
app.get("/api/jewelry/admin", (_req, res) => {
  try {
    const items = readJewelryDb().sort((a, b) => b.createdAt - a.createdAt);
    res.json(items);
  } catch (err) {
    console.error("GET /api/jewelry/admin:", err);
    res.status(500).json({ error: "Failed to fetch admin catalog." });
  }
});

/** POST /api/jewelry — add new jewelry (multipart: name, category, tags, price, active, anchorPoint, jewelryImage) */
app.post("/api/jewelry", upload.single("jewelryImage"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a transparent PNG jewelry image." });
    }

    const { name, category, tags, price, active, anchorPoint } = req.body;

    const jewelryId = `j-${Date.now()}`;
    const imageUrl  = `/jewelry-images/${req.file.filename}`;

    const items = readJewelryDb();
    items.push({
      id:           jewelryId,
      name,
      category,
      imageUrl,
      filename:     req.file.filename,
      anchorPoint:  anchorPoint ? JSON.parse(anchorPoint) : { x: 0.5, y: 0.5 },
      tags:         tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      price:        price ? parseFloat(price) : null,
      active:       active === "true" || active === true,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    });
    writeJewelryDb(items);

    res.status(201).json({ success: true, id: jewelryId, imageUrl });
  } catch (err) {
    console.error("POST /api/jewelry:", err);
    res.status(500).json({ error: "Failed to add jewelry.", detail: err.message });
  }
});

/** POST /api/jewelry/detect — AI vision detection of category/name from an image */
app.post("/api/jewelry/detect", uploadToMemory.single("image"), postDetectJewelry);

/** PUT /api/jewelry/:id — update metadata fields */
app.put("/api/jewelry/:id", (req, res) => {
  try {
    const { id } = req.params;
    const items = readJewelryDb();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Item not found." });
    }
    items[idx] = { ...items[idx], ...req.body, updatedAt: Date.now() };
    writeJewelryDb(items);
    res.json({ success: true });
  } catch (err) {
    console.error(`PUT /api/jewelry/${req.params.id}:`, err);
    res.status(500).json({ error: "Failed to update item." });
  }
});

/** DELETE /api/jewelry/:id — delete from disk + JSON */
app.delete("/api/jewelry/:id", (req, res) => {
  try {
    const { id } = req.params;
    const items = readJewelryDb();
    const item = items.find((i) => i.id === id);

    if (item?.filename) {
      const filePath = path.join(JEWELRY_DIR, item.filename);
      try { fs.unlinkSync(filePath); } catch (_) { /* already gone, not fatal */ }
    }

    writeJewelryDb(items.filter((i) => i.id !== id));
    res.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/jewelry/${req.params.id}:`, err);
    res.status(500).json({ error: "Failed to delete item." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER PHOTOS API — still Firebase-backed; uncomment once Firestore/Storage
// are enabled on the project.
// ─────────────────────────────────────────────────────────────────────────────

// app.post(
//   "/api/user/upload-photos",
//   upload.fields([
//     { name: "halfPhoto", maxCount: 1 },
//     { name: "fullPhoto", maxCount: 1 },
//   ]),
//   async (req, res) => { ... }
// );

// ─────────────────────────────────────────────────────────────────────────────
// AI TRY-ON API (fal.ai nano-banana/edit — generates a photorealistic composite
// of the user's photo wearing the selected jewelry piece)
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/ai/try-on", tryOnRoutes);

// ─── Health check ────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ─── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`✅  JTAI Server (local-disk jewelry edition) running at http://localhost:${PORT}`);
});
