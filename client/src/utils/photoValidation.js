/**
 * Photo Validation Utility for JTAI Try-On Gate
 */

// 1. Check Dimensions
export const validateDimensions = (width, height) => {
  const minRes = 500;
  return {
    success: width >= minRes && height >= minRes,
    message: width >= minRes && height >= minRes 
      ? `Resolution OK: ${width}x${height}px`
      : `Resolution too low: ${width}x${height}px (Minimum 500x500px required)`
  };
};

// 2. Check Brightness and Exposure of Image URL
export const validateBrightnessAndContrast = async (imageElement) => {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      // Downscale to 100x100 for fast pixel processing
      canvas.width = 100;
      canvas.height = 100;
      ctx.drawImage(imageElement, 0, 0, 100, 100);
      
      const imgData = ctx.getImageData(0, 0, 100, 100);
      const pixels = imgData.data;
      let totalLuminance = 0;
      
      // Calculate average brightness and standard deviation (contrast indicator)
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        
        // Relative luminance formula
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += luminance;
      }
      
      const meanBrightness = totalLuminance / (canvas.width * canvas.height);
      
      // Calculate variance for contrast/clarity proxy
      let varianceSum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        varianceSum += Math.pow(luminance - meanBrightness, 2);
      }
      const variance = varianceSum / (canvas.width * canvas.height);
      const contrastScore = Math.sqrt(variance);

      // Brightness rules: 50 is too dark, 240 is overexposed
      const tooDark = meanBrightness < 50;
      const tooBright = meanBrightness > 240;
      const blurry = contrastScore < 15; // Low contrast variance usually indicates blurred/flat images

      if (tooDark) {
        resolve({
          success: false,
          score: meanBrightness,
          message: "Photo is too dark. Please upload in a well-lit area."
        });
      } else if (tooBright) {
        resolve({
          success: false,
          score: meanBrightness,
          message: "Photo is overexposed. Avoid direct harsh background light."
        });
      } else if (blurry) {
        resolve({
          success: false,
          score: contrastScore,
          message: "Photo lacks clarity (blurry or low contrast). Try a sharper shot."
        });
      } else {
        resolve({
          success: true,
          score: meanBrightness,
          message: "Premium lighting & clarity detected."
        });
      }
    } catch (err) {
      console.error("Validation error", err);
      // Fallback
      resolve({
        success: true,
        score: 128,
        message: "Clarity check bypassed."
      });
    }
  });
};

// 3. Validation of Landmarks Symmetry / Alignment
export const validateFaceAlignment = (landmarks) => {
  if (!landmarks || landmarks.length === 0) {
    return { success: false, message: "No face detected in photo." };
  }

  const face = landmarks[0]; // Primary face

  // Check face rotation / skew
  // Left eye outer corner (roughly index 33), Right eye outer corner (roughly index 263)
  const leftEye = face[33];
  const rightEye = face[263];
  const noseTip = face[4];
  const chin = face[152];

  if (!leftEye || !rightEye || !noseTip || !chin) {
    return { success: false, message: "Cannot isolate crucial facial features." };
  }

  // Calculate eye tilt/rotation angle
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const tilt = Math.abs(dy / dx); // Tangent of angle

  // Check symmetry horizontally relative to nose-chin line
  const eyeCenterIndex = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2
  };
  
  const noseDeviation = Math.abs(noseTip.x - eyeCenterIndex.x);
  const facialSpan = Math.abs(rightEye.x - leftEye.x);
  const noseSymmetryRatio = noseDeviation / facialSpan;

  // Maximum tilt permitted before rejecting: ~15 degrees (tilt value = 0.27)
  const isTilted = tilt > 0.27;

  // Nose deviation ratio should not exceed 18% of facial span for front-facing
  const isProfileOnly = noseSymmetryRatio > 0.18;

  if (isTilted) {
    return {
      success: false,
      message: "Head is tilted too heavily. Center your photo alignment."
    };
  }

  if (isProfileOnly) {
    return {
      success: false,
      message: "Profile face detected. Please face the camera directly."
    };
  }

  return {
    success: true,
    message: "Perfect front-facing face alignment."
  };
};
