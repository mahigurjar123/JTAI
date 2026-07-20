import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

let poseLandmarkerInstance = null;

// PoseLandmarker indices used across this app
export const POSE_LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20
};

/**
 * Loads and caches the MediaPipe Pose Landmarker model.
 * Uses GPU delegate if supported by the browser.
 */
export const loadPoseLandmarker = async () => {
  if (poseLandmarkerInstance) {
    return poseLandmarkerInstance;
  }

  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
    );

    poseLandmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "IMAGE",
      numPoses: 1
    });

    return poseLandmarkerInstance;
  } catch (error) {
    console.error("Failed to initialize MediaPipe PoseLandmarker:", error);
    throw new Error("Could not load AI body-pose model. Check your internet connection.");
  }
};

/**
 * Detects body pose landmarks (shoulders, hips, wrists...) in an HTMLImageElement.
 * Returns the landmark array for the primary detected person, or null if none found.
 * Unlike face detection, a missing/low-confidence body pose is NOT a hard failure —
 * callers should fall back to face-based estimation.
 */
export const detectPoseLandmarks = async (imageElement) => {
  try {
    const landmarker = await loadPoseLandmarker();
    const result = landmarker.detect(imageElement);
    if (!result.landmarks || result.landmarks.length === 0) {
      return null;
    }
    return result.landmarks[0];
  } catch (error) {
    console.error("Error during pose detection:", error);
    return null;
  }
};

/**
 * Returns { leftShoulder, rightShoulder, valid } in normalized [0,1] image coordinates,
 * only when both shoulder landmarks were detected with reasonable confidence.
 */
export const getShoulderPoints = (poseLandmarks) => {
  if (!poseLandmarks) return null;

  const left = poseLandmarks[POSE_LANDMARK.LEFT_SHOULDER];
  const right = poseLandmarks[POSE_LANDMARK.RIGHT_SHOULDER];

  if (!left || !right) return null;

  const minVisibility = 0.4;
  if (
    (left.visibility !== undefined && left.visibility < minVisibility) ||
    (right.visibility !== undefined && right.visibility < minVisibility)
  ) {
    return null;
  }

  return { leftShoulder: left, rightShoulder: right };
};
