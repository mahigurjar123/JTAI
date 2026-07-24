// Model: shape + validation for an AI try-on generation request.
// A request needs the user's photo and one or more jewelry product photos
// (one per category, worn together), all as data URIs (base64) or public
// URLs that fal.ai can fetch.

export class TryOnRequest {
  constructor({ userPhoto, faceRefPhoto, jewelryItems }) {
    this.userPhoto = userPhoto;
    // Optional close-up photo used ONLY as a face-identity reference — the
    // output is always composited onto `userPhoto`, never onto this one.
    this.faceRefPhoto = faceRefPhoto;
    // [{ jewelryPhoto, jewelryCategory, jewelryName }, ...] — every piece is
    // applied together in a single generation.
    this.jewelryItems = jewelryItems || [];
  }

  static fromRequestBody(body) {
    return new TryOnRequest({
      userPhoto: body.userPhoto,
      faceRefPhoto: body.faceRefPhoto,
      jewelryItems: Array.isArray(body.jewelryItems) ? body.jewelryItems : []
    });
  }

  validate() {
    const errors = [];
    if (!this.userPhoto || typeof this.userPhoto !== "string") {
      errors.push("userPhoto is required (data URI or URL).");
    }
    if (this.jewelryItems.length === 0) {
      errors.push("At least one jewelry item is required.");
    }
    this.jewelryItems.forEach((item, idx) => {
      if (!item.jewelryPhoto || typeof item.jewelryPhoto !== "string") {
        errors.push(`jewelryItems[${idx}].jewelryPhoto is required.`);
      }
      if (!item.jewelryCategory || typeof item.jewelryCategory !== "string") {
        errors.push(`jewelryItems[${idx}].jewelryCategory is required.`);
      }
    });
    return errors;
  }
}

// Response shape returned to the client on success.
export class TryOnResult {
  constructor({ imageUrl, requestId }) {
    this.imageUrl = imageUrl;
    this.requestId = requestId;
  }

  toJSON() {
    return { success: true, imageUrl: this.imageUrl, requestId: this.requestId };
  }
}
