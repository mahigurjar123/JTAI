// Model: shape + validation for an AI try-on generation request.
// A request needs the user's photo and the jewelry product photo, both as
// data URIs (base64) or public URLs that fal.ai can fetch.

export class TryOnRequest {
  constructor({ userPhoto, jewelryPhoto, jewelryCategory, jewelryName }) {
    this.userPhoto = userPhoto;
    this.jewelryPhoto = jewelryPhoto;
    this.jewelryCategory = jewelryCategory;
    this.jewelryName = jewelryName;
  }

  static fromRequestBody(body) {
    return new TryOnRequest({
      userPhoto: body.userPhoto,
      jewelryPhoto: body.jewelryPhoto,
      jewelryCategory: body.jewelryCategory,
      jewelryName: body.jewelryName
    });
  }

  validate() {
    const errors = [];
    if (!this.userPhoto || typeof this.userPhoto !== "string") {
      errors.push("userPhoto is required (data URI or URL).");
    }
    if (!this.jewelryPhoto || typeof this.jewelryPhoto !== "string") {
      errors.push("jewelryPhoto is required (data URI or URL).");
    }
    if (!this.jewelryCategory || typeof this.jewelryCategory !== "string") {
      errors.push("jewelryCategory is required.");
    }
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
