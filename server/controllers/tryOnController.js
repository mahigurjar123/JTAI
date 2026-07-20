// Controller: translates HTTP request/response to and from the service layer.
// No business logic here — only request parsing, validation dispatch, and
// status-code/error shaping.

import { TryOnRequest } from "../models/tryOnRequest.js";
import { generateTryOnImage } from "../services/aiTryOnService.js";

export async function postGenerateTryOn(req, res) {
  const tryOnRequest = TryOnRequest.fromRequestBody(req.body);

  const validationErrors = tryOnRequest.validate();
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, errors: validationErrors });
  }

  try {
    const result = await generateTryOnImage(tryOnRequest);
    return res.status(200).json(result.toJSON());
  } catch (err) {
    console.error("POST /api/ai/try-on:", err);
    return res.status(502).json({
      success: false,
      error: "AI image generation failed.",
      detail: err.message
    });
  }
}
