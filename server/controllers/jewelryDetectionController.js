// Controller: accepts an uploaded jewelry image, uploads it to fal's storage
// (vision models can't fetch localhost URLs), runs AI detection, and returns
// the guessed category/name for the Admin Panel to auto-fill.

import { fal } from "@fal-ai/client";
import { detectJewelryFromImage } from "../services/jewelryDetectionService.js";

export async function postDetectJewelry(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "An image file is required." });
  }

  try {
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "image/png" });
    const uploadedUrl = await fal.storage.upload(blob);

    const detection = await detectJewelryFromImage(uploadedUrl);
    return res.status(200).json({ success: true, ...detection });
  } catch (err) {
    console.error("POST /api/jewelry/detect:", err);
    return res.status(502).json({
      success: false,
      error: "Could not analyze this image.",
      detail: err.message
    });
  }
}
