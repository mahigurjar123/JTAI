// ViewModel: owns AI try-on generation state for BOTH uploaded photos (the
// close-up "half" photo and the full-body photo) and exposes a single
// `generate` action that runs both generations in parallel. The View only
// reads `half`/`full` result state and renders it — it never talks to the
// service or builds requests itself.

import { useState, useCallback } from "react";
import { requestAiTryOn } from "../services/aiTryOnApi";

/** Converts an HTMLImageElement's source (already-loaded preview URL) to a data URL. */
async function toDataUrl(imageObjectUrl) {
  const res = await fetch(imageObjectUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const initialSlotState = { isGenerating: false, result: null, error: null };

async function generateForSlot({ userPhoto, jewelry }) {
  const userPhotoDataUrl = await toDataUrl(userPhoto.preview);
  return requestAiTryOn({
    userPhotoDataUrl,
    jewelryImageUrl: jewelry.imageUrl,
    jewelryCategory: jewelry.category,
    jewelryName: jewelry.name
  });
}

export function useAiTryOnViewModel() {
  const [half, setHalf] = useState(initialSlotState);
  const [full, setFull] = useState(initialSlotState);

  // Runs both photo generations independently and in parallel — a failure on
  // one (e.g. Photo B not uploaded, or a transient API error) never blocks or
  // clears the other's result.
  const generate = useCallback(async ({ userPhotos, jewelry }) => {
    if (!jewelry?.imageUrl) {
      const msg = "Select a jewelry item to generate.";
      setHalf((s) => ({ ...s, error: msg }));
      setFull((s) => ({ ...s, error: msg }));
      return;
    }

    const halfPhoto = userPhotos?.halfPhoto;
    const fullPhoto = userPhotos?.fullPhoto;

    if (halfPhoto?.preview) {
      setHalf({ isGenerating: true, result: null, error: null });
      generateForSlot({ userPhoto: halfPhoto, jewelry })
        .then((result) => setHalf({ isGenerating: false, result, error: null }))
        .catch((err) => {
          console.error("AI try-on generation failed (Photo A):", err);
          setHalf({ isGenerating: false, result: null, error: err.message || "Generation failed." });
        });
    } else {
      setHalf({ isGenerating: false, result: null, error: null });
    }

    if (fullPhoto?.preview) {
      setFull({ isGenerating: true, result: null, error: null });
      generateForSlot({ userPhoto: fullPhoto, jewelry })
        .then((result) => setFull({ isGenerating: false, result, error: null }))
        .catch((err) => {
          console.error("AI try-on generation failed (Photo B):", err);
          setFull({ isGenerating: false, result: null, error: err.message || "Generation failed." });
        });
    } else {
      setFull({ isGenerating: false, result: null, error: null });
    }
  }, []);

  const reset = useCallback(() => {
    setHalf(initialSlotState);
    setFull(initialSlotState);
  }, []);

  return { half, full, generate, reset };
}
