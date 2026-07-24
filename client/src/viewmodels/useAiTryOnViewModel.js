// ViewModel: owns AI try-on generation state. Generates a SINGLE result
// showing every selected jewelry piece worn together, always composited onto
// the full-body photo — the close-up "half" photo is sent along only as a
// face-identity reference so the model locks onto the person's real face,
// but it is never itself the base image and never produces its own separate
// output. The View only reads `state` and renders it — it never talks to the
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

const initialState = { isGenerating: false, result: null, error: null };

export function useAiTryOnViewModel() {
  const [state, setState] = useState(initialState);

  const generate = useCallback(async ({ userPhotos, jewelryItems }) => {
    if (!jewelryItems || jewelryItems.length === 0) {
      setState((s) => ({ ...s, error: "Select at least one jewelry item to generate." }));
      return;
    }

    const fullPhoto = userPhotos?.fullPhoto;
    const halfPhoto = userPhotos?.halfPhoto;

    if (!fullPhoto?.preview) {
      setState({
        isGenerating: false,
        result: null,
        error: "Upload the full-body photo (Photo B) — the try-on is generated on it."
      });
      return;
    }

    setState({ isGenerating: true, result: null, error: null });

    try {
      const userPhotoDataUrl = await toDataUrl(fullPhoto.preview);
      const faceRefPhotoDataUrl = halfPhoto?.preview ? await toDataUrl(halfPhoto.preview) : null;

      const result = await requestAiTryOn({
        userPhotoDataUrl,
        faceRefPhotoDataUrl,
        jewelryItems: jewelryItems.map((j) => ({
          imageUrl: j.imageUrl,
          category: j.category,
          name: j.name
        }))
      });

      setState({ isGenerating: false, result, error: null });
    } catch (err) {
      console.error("AI try-on generation failed:", err);
      setState({ isGenerating: false, result: null, error: err.message || "Generation failed." });
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, generate, reset };
}
