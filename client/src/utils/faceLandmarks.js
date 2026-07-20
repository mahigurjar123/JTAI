import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

let faceLandmarkerInstance = null;

/**
 * Loads and caches the MediaPipe Face Landmarker model.
 * Uses GPU delegate if supported by the browser.
 */
export const loadFaceLandmarker = async () => {
  if (faceLandmarkerInstance) {
    return faceLandmarkerInstance;
  }

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
    );

    faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "IMAGE",
      numFaces: 1
    });

    return faceLandmarkerInstance;
  } catch (error) {
    console.error("Failed to initialize MediaPipe FaceLandmarker:", error);
    throw new Error("Could not load AI vision model. Check your internet connection.");
  }
};

/**
 * Detects face landmarks in an HTMLImageElement.
 * Returns core coordinate landmarks or throws error.
 */
export const detectLandmarks = async (imageElement) => {
  try {
    const landmarker = await loadFaceLandmarker();
    const result = landmarker.detect(imageElement);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }
    return result.faceLandmarks;
  } catch (error) {
    console.error("Error during landmark detection:", error);
    throw error;
  }
};
