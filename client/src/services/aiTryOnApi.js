// Service: talks to the backend's AI try-on endpoint. No React, no state —
// just an HTTP call that the ViewModel can call and await.

import { TryOnResult } from "../models/TryOnResult";

const API_BASE = "http://localhost:5000";

/**
 * @param {{ userPhotoDataUrl: string, faceRefPhotoDataUrl?: string|null, jewelryItems: Array<{ imageUrl: string, category: string, name?: string }> }} params
 * @returns {Promise<TryOnResult>}
 */
export async function requestAiTryOn({ userPhotoDataUrl, faceRefPhotoDataUrl, jewelryItems }) {
  const res = await fetch(`${API_BASE}/api/ai/try-on/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userPhoto: userPhotoDataUrl,
      faceRefPhoto: faceRefPhotoDataUrl || undefined,
      jewelryItems: jewelryItems.map((item) => ({
        jewelryPhoto: item.imageUrl,
        jewelryCategory: item.category,
        jewelryName: item.name
      }))
    })
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || json.errors?.join(", ") || "AI generation failed.");
  }

  return TryOnResult.fromApiResponse(json);
}
