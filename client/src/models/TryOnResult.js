// Model: shape of an AI-generated try-on result on the client side.

export class TryOnResult {
  constructor({ imageUrl, requestId }) {
    this.imageUrl = imageUrl;
    this.requestId = requestId;
  }

  static fromApiResponse(json) {
    return new TryOnResult({ imageUrl: json.imageUrl, requestId: json.requestId });
  }
}
