import React, { useRef, useEffect, useState } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import { getShoulderPoints } from "../utils/poseLandmarks";
import { useDownloadGateViewModel } from "../viewmodels/useDownloadGateViewModel";
import LeadCaptureModal from "./LeadCaptureModal";

export default function OverlayCanvas({ userPhotos, jewelry }) {
  const canvasRef = useRef(null);
  const downloadGate = useDownloadGateViewModel();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [jewelryLoaded, setJewelryLoaded] = useState(false);
  const [jewelryError, setJewelryError] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // Precision alignment and layout fine-tuning states
  const [scale, setScale] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0); // in degrees

  // Photo Selector: "half" (Photo A) or "full" (Photo B)
  const [selectedPhotoType, setSelectedPhotoType] = useState("half");

  // Lighting & Match enhancement states
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hue, setHue] = useState(0); // color temperature tint (hue-rotate)
  const [opacity, setOpacity] = useState(100);

  // Drop Shadow states
  const [shadowBlur, setShadowBlur] = useState(12);
  const [shadowOffsetX, setShadowOffsetX] = useState(0);
  const [shadowOffsetY, setShadowOffsetY] = useState(8);
  const [shadowOpacity, setShadowOpacity] = useState(0.3);

  // Occlusion / Layering masking states (for Neck wrapping effect)
  const [occlusionEnabled, setOcclusionEnabled] = useState(true);
  const [occlusionHeight, setOcclusionHeight] = useState(25); // Chin drop offset limit in %

  // Interaction (Drag & Drop) states
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const originalImgRef = useRef(null);
  const jewelryImgRef = useRef(null);
  // Opaque-content bounding box of the current jewelry image, in normalized [0,1]
  // coordinates relative to the full image. Product PNGs usually have a lot of
  // transparent/keyed padding around the actual piece, so anchoring/scaling off
  // the full image dimensions makes every design sit and size differently.
  // Measuring the real opaque region per-image makes placement consistent
  // regardless of how much padding a given product photo has.
  const jewelryBoundsRef = useRef(null);

  // Reset parameters when jewelry piece changes
  useEffect(() => {
    setScale(1.0);
    setOffsetX(0);
    setOffsetY(0);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setHue(0);
    setOpacity(100);
    setShadowBlur(12);
    setShadowOffsetX(0);
    setShadowOffsetY(8);
    setShadowOpacity(0.3);
    setOcclusionEnabled(true);
    setOcclusionHeight(25);
  }, [jewelry]);

  // Direct Auto-Switch to Photo B for Wrists (Bangle) & Fingers (Ring)
  useEffect(() => {
    if (!jewelry) return;
    if (jewelry.category === "bangle" || jewelry.category === "ring") {
      if (userPhotos?.fullPhoto) {
        setSelectedPhotoType("full");
      }
    } else {
      setSelectedPhotoType("half");
    }
  }, [jewelry, userPhotos]);

  // Keyboard fine adjustments (Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!jewelry) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
      
      const step = e.shiftKey ? 2.5 : 0.5; // Fine or fast step
      if (e.key === "ArrowUp") {
        setOffsetY((prev) => prev - step);
      } else if (e.key === "ArrowDown") {
        setOffsetY((prev) => prev + step);
      } else if (e.key === "ArrowLeft") {
        setOffsetX((prev) => prev - step);
      } else if (e.key === "ArrowRight") {
        setOffsetX((prev) => prev + step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jewelry]);

  // Load appropriate original photo (A vs B)
  useEffect(() => {
    const photo = selectedPhotoType === "full" ? userPhotos?.fullPhoto : userPhotos?.halfPhoto;
    if (!photo?.preview) return;

    setImgLoaded(false);
    const img = new Image();
    img.src = photo.preview;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      originalImgRef.current = img;
      setImgLoaded(true);
    };
  }, [userPhotos, selectedPhotoType]);

  // Scans an ImageData's alpha channel and returns the bounding box of pixels
  // above the given alpha threshold, normalized to [0,1] of the image dimensions.
  // Falls back to the full image (0,0 - 1,1) if nothing meets the threshold.
  //
  // Also returns `centerTop`: the topmost opaque pixel within a narrow band around
  // the horizontal center only. Many necklace/choker designs have tall side "horns"
  // or hooks (meant to sit behind the ears/neck) that stick up well above where the
  // front collar actually rests against the throat — using the overall bbox top as
  // the neck anchor drags those side horns up to the chin and leaves the real collar
  // line dangling below it. `centerTop` finds where the piece's front-center edge
  // actually is, which is what should touch the throat.
  const measureOpaqueBounds = (imgData, alphaThreshold = 40) => {
    const { data, width, height } = imgData;
    let minX = width, minY = height, maxX = -1, maxY = -1;

    // Sampling every pixel on a large product photo is wasteful; a stride keeps
    // this fast while still being accurate enough for placement purposes.
    const stride = Math.max(1, Math.floor(Math.max(width, height) / 400));

    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) {
      return { top: 0, bottom: 1, left: 0, right: 1, centerTop: 0 };
    }

    // Narrow center band (middle 24% of the content width) — scan every row from
    // the top until one has an opaque pixel inside that band.
    const contentCenterX = (minX + maxX) / 2;
    const contentWidthPx = Math.max(maxX - minX, 1);
    const bandHalfWidth = contentWidthPx * 0.12;
    const bandMinX = Math.max(0, Math.round(contentCenterX - bandHalfWidth));
    const bandMaxX = Math.min(width - 1, Math.round(contentCenterX + bandHalfWidth));

    let centerTopY = minY; // fall back to overall top if the band never hits
    const rowStride = Math.max(1, Math.floor(height / 800));
    outer: for (let y = minY; y <= maxY; y += rowStride) {
      for (let x = bandMinX; x <= bandMaxX; x += 2) {
        if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
          centerTopY = y;
          break outer;
        }
      }
    }

    return {
      top: minY / height,
      bottom: maxY / height,
      left: minX / width,
      right: maxX / width,
      centerTop: centerTopY / height
    };
  };

  // Load transparent jewelry product image & perform dynamic chroma-key background keying on the fly
  useEffect(() => {
    jewelryImgRef.current = null;
    jewelryBoundsRef.current = null;
    setJewelryLoaded(false);
    setJewelryError(false);

    if (!jewelry?.imageUrl) return;

    let cancelled = false;
    const img = new Image();
    img.src = jewelry.imageUrl;
    img.crossOrigin = "anonymous";
    img.onerror = () => {
      if (cancelled) return;
      console.error("Failed to load jewelry image:", jewelry.imageUrl);
      setJewelryError(true);
    };
    img.onload = () => {
      if (cancelled) return;

      // Perform dynamic client-side chroma keying of black backgrounds so solid catalog uploads work immediately!
      const offscreen = document.createElement("canvas");
      offscreen.width = img.naturalWidth;
      offscreen.height = img.naturalHeight;
      const oCtx = offscreen.getContext("2d");
      oCtx.drawImage(img, 0, 0);
      
      const imgData = oCtx.getImageData(0, 0, offscreen.width, offscreen.height);
      const data = imgData.data;
      
      let blackCount = 0;
      const samplePoints = [
        { x: 5, y: 5 }, { x: img.naturalWidth - 5, y: 5 },
        { x: 5, y: img.naturalHeight - 5 }, { x: img.naturalWidth - 5, y: img.naturalHeight - 5 }
      ];
      samplePoints.forEach(pt => {
        const offset = (pt.y * img.naturalWidth + pt.x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        if (r < 40 && g < 40 && b < 40) {
          blackCount++;
        }
      });
      
      if (blackCount >= 2) {
        // Wide, smooth luma->alpha ramp (0-90 instead of a hard 20-unit cutoff) so a
        // soft photographic glow/vignette background fades out gradually. A narrow ramp
        // leaves a dark halo/fringe right at the edge of the jewelry — the "sticker
        // cutout" look — because the mid-tones of the glow get chopped instead of faded.
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luma < 90) {
            const alpha = luma < 10 ? 0 : ((luma - 10) / 80) * 255;
            data[i + 3] = Math.min(data[i + 3], alpha);
          }
        }

        // De-fringe: for edge pixels (partially transparent), strip the darkened
        // "background bleed" out of their RGB so the remaining sliver of color isn't
        // a muddy dark halo — un-premultiply toward the pixel's own hue at full luma.
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a > 0 && a < 250) {
            const boost = 255 / Math.max(a, 60);
            data[i] = Math.min(255, data[i] * boost);
            data[i + 1] = Math.min(255, data[i + 1] * boost);
            data[i + 2] = Math.min(255, data[i + 2] * boost);
          }
        }

        oCtx.putImageData(imgData, 0, 0);

        // Feather the cutout edge very slightly (soft blur) so the boundary between
        // jewelry and skin isn't a razor-sharp pixel-perfect line, which is what reads
        // as "pasted on" rather than photographed/worn.
        const feathered = document.createElement("canvas");
        feathered.width = offscreen.width;
        feathered.height = offscreen.height;
        const fCtx = feathered.getContext("2d");
        fCtx.filter = "blur(1.1px)";
        fCtx.drawImage(offscreen, 0, 0);

        jewelryImgRef.current = feathered;
        jewelryBoundsRef.current = measureOpaqueBounds(imgData);
      } else {
        jewelryImgRef.current = img;
        // Image was already transparent (no chroma-key needed) — imgData still
        // holds its real alpha channel, so measure straight from it.
        jewelryBoundsRef.current = measureOpaqueBounds(imgData);
      }

      setJewelryLoaded(true);
    };

    return () => {
      cancelled = true;
    };
  }, [jewelry]);

  // Render Canvas
  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !originalImgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const img = originalImgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw user photo
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (showOriginal || !jewelryLoaded || !jewelryImgRef.current) {
      return; 
    }

    const jImg = jewelryImgRef.current;
    
    // Fetch landmarks for active photo if available
    const activePhoto = selectedPhotoType === "full" ? userPhotos?.fullPhoto : userPhotos?.halfPhoto;
    const landmarks = activePhoto?.landmarks?.[0];
    const hasLandmarks = landmarks && landmarks.length > 0;

    // Fetch body-pose shoulder points for the active photo, if detected.
    // This is what lets the necklace lock onto the real neck/collar position
    // instead of an estimate extrapolated purely from face size.
    const shoulderPoints = getShoulderPoints(activePhoto?.poseLandmarks);
    const hasShoulders = !!shoulderPoints;

    // Core points
    const p = (lmark) => ({
      x: lmark.x * canvas.width,
      y: lmark.y * canvas.height
    });

    let targetPos = { x: canvas.width / 2, y: canvas.height / 2 };
    let targetWidth = canvas.width * 0.3;
    let maxHt = null;
    let userAngle = (rotation * Math.PI) / 180;
    let faceWidthPx = 0;
    let faceHeightPx = 0;

    if (hasLandmarks) {
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const chin = landmarks[152];
      const forehead = landmarks[10];
      const leftEar = landmarks[234];
      const rightEar = landmarks[454];

      const leftEyePos = p(leftEye);
      const rightEyePos = p(rightEye);
      const chinPos = p(chin);
      const foreheadPos = p(forehead);
      const leftEarPos = p(leftEar);
      const rightEarPos = p(rightEar);

      faceWidthPx  = Math.sqrt(Math.pow(rightEarPos.x - leftEarPos.x, 2) + Math.pow(rightEarPos.y - leftEarPos.y, 2));
      faceHeightPx = Math.sqrt(Math.pow(chinPos.x - foreheadPos.x, 2) + Math.pow(chinPos.y - foreheadPos.y, 2));

      // Alignment angle from eye alignment
      const dx = rightEyePos.x - leftEyePos.x;
      const dy = rightEyePos.y - leftEyePos.y;
      const baseAngle = Math.atan2(dy, dx);
      userAngle = baseAngle + (rotation * Math.PI) / 180;
    }

    // Shadow Configs
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${shadowOpacity})`;
    ctx.shadowBlur = shadowBlur * scale;
    ctx.shadowOffsetX = shadowOffsetX * scale;
    ctx.shadowOffsetY = shadowOffsetY * scale;

    // Real opaque-content bounds of this jewelry image (measured after chroma-keying),
    // normalized [0,1] against the full image. Product photos carry a lot of transparent
    // padding around the actual piece — using these bounds instead of the raw image edges
    // is what makes "targetWidth" mean the necklace's real width, and the anchor land on
    // the actual top loop instead of empty space above it.
    const jBounds = jewelryBoundsRef.current || { top: 0, bottom: 1, left: 0, right: 1 };
    const jContentWidthFrac = Math.max(jBounds.right - jBounds.left, 0.01);
    const jContentHeightFrac = Math.max(jBounds.bottom - jBounds.top, 0.01);

    // Smart anchor calculation. For necklaces, use the front-center collar edge
    // (centerTop) rather than the overall top of the opaque content — designs with
    // tall side hooks/horns (meant to sit behind the ears) have their overall bbox
    // top well above where the piece actually rests on the throat, which would drag
    // the whole necklace up into the chin if used as the anchor.
    let jAnchor = jewelry.anchorPoint ? { ...jewelry.anchorPoint } : { x: 0.5, y: 0.5 };
    if (jAnchor.x === 0.5 && jAnchor.y === 0.5) {
      if (jewelry.category === "necklace") {
        jAnchor.y = jBounds.centerTop ?? jBounds.top;
      } else if (jewelry.category === "earrings") {
        jAnchor.y = jBounds.top;
      } else if (jewelry.category === "maang-tikka") {
        jAnchor.y = jBounds.top;
      }
    }

    const drawJewelryPiece = (pos, width, rotAngle, maxHeight, curveDepth = 0) => {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rotAngle);

      // Match color temperature and ambient room light using context filters
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg) opacity(${opacity}%)`;

      // jImg is either an <img> (has naturalWidth/naturalHeight) or an offscreen
      // <canvas> produced by the chroma-key pass (has width/height instead) —
      // using naturalWidth on a canvas silently yields NaN and drawImage() no-ops.
      const jImgWidth = jImg.naturalWidth || jImg.width;
      const jImgHeight = jImg.naturalHeight || jImg.height;
      const aspect = jImgWidth / jImgHeight;

      // "width" is the desired real width of the jewelry's opaque content — scale the
      // FULL image so that its content-only slice ends up at that width, then let the
      // (larger) full image extend beyond it symmetrically via the padding fractions.
      const fullImageWidth = (width / jContentWidthFrac) * scale;
      const fullImageHeight = (fullImageWidth / aspect);

      let drawWidth = fullImageWidth;
      let drawHeight = fullImageHeight;

      if (maxHeight) {
        const contentHeight = drawHeight * jContentHeightFrac;
        if (contentHeight > maxHeight) {
          const shrink = maxHeight / contentHeight;
          drawWidth *= shrink;
          drawHeight *= shrink;
        }
      }

      const drawX = -drawWidth * jAnchor.x;
      const drawY = -drawHeight * jAnchor.y;

      if (curveDepth > 0) {
        // Wrap the flat product photo around the neck's cylindrical curve instead of
        // pasting it dead flat — this is what makes it read as "worn" rather than a
        // sticker. Slice the image into thin vertical strips and drop each strip
        // vertically by an amount following a curve (max at the outer edges, zero at
        // the center), plus a matching slight horizontal compression so the far edges
        // don't just droop but also appear to recede — the same way a real necklace's
        // sides curve back and away from the camera around the neck.
        const strips = 28;
        const stripSrcW = jImgWidth / strips;
        const stripDrawW = drawWidth / strips;
        for (let i = 0; i < strips; i++) {
          const stripCenterFrac = (i + 0.5) / strips; // 0..1 across the piece
          const t = stripCenterFrac * 2 - 1; // -1..1, 0 at center
          const curveY = curveDepth * (t * t); // parabolic droop toward the edges
          const curveScale = 1 - 0.08 * (t * t); // slight squeeze at the edges (recede)

          const sx = i * stripSrcW;
          const dxStripCenter = drawX + (i + 0.5) * stripDrawW;
          const dStripW = stripDrawW * curveScale;
          const dx = dxStripCenter - dStripW / 2;

          ctx.drawImage(
            jImg,
            sx, 0, stripSrcW, jImgHeight,
            dx, drawY + curveY, dStripW, drawHeight
          );
        }
      } else {
        ctx.drawImage(jImg, drawX, drawY, drawWidth, drawHeight);
      }
      ctx.restore();
    };

    // Category Alignment Pipelines
    if (jewelry.category === "necklace") {
      // Shoulder-anchored placement (primary path): the neck base is derived from real
      // body-pose shoulder points, not a fixed guess extrapolated from face size alone.
      // This is what keeps the necklace locked to the actual neck/collar regardless of
      // camera distance, framing, or body pose.
      let shoulderMid = null;
      let shoulderWidthPx = 0;
      let shoulderAngle = null;

      if (hasShoulders) {
        const leftShoulderPos = p(shoulderPoints.leftShoulder);
        const rightShoulderPos = p(shoulderPoints.rightShoulder);
        shoulderMid = {
          x: (leftShoulderPos.x + rightShoulderPos.x) / 2,
          y: (leftShoulderPos.y + rightShoulderPos.y) / 2
        };
        shoulderWidthPx = Math.sqrt(
          Math.pow(rightShoulderPos.x - leftShoulderPos.x, 2) +
          Math.pow(rightShoulderPos.y - leftShoulderPos.y, 2)
        );
        // MediaPipe pose "left"/"right" are mirrored relative to a front-facing subject,
        // so left shoulder is at screen-right — angle sign matches face eye-angle convention.
        shoulderAngle = Math.atan2(
          leftShoulderPos.y - rightShoulderPos.y,
          leftShoulderPos.x - rightShoulderPos.x
        );
      }

      // Different necklace designs are naturally narrower or wider relative to their own
      // height (a tight choker vs. a deep statement/bridal piece with long drops) — sizing
      // every design off the same fixed fraction of shoulder width makes some look right
      // and others look oversized or tiny. Use the piece's own measured content aspect
      // ratio to nudge the neck-width fraction: wide/flat designs (chokers) get scaled
      // down slightly relative to shoulder width, tall/narrow designs (long necklaces)
      // get scaled up slightly, so the *visual weight* on the neck stays consistent.
      const jContentAspect = jContentWidthFrac / jContentHeightFrac; // >1 = wider than tall
      const neckWidthFraction = Math.min(0.56, Math.max(0.36, 0.46 / Math.sqrt(jContentAspect)));

      if (hasShoulders && hasLandmarks) {
        const chinPos = p(landmarks[152]);
        // The anchor point represents the necklace's top loop, which rests at the base
        // of the neck / top of the collarbone — much closer to the chin than to the
        // shoulder line itself. A small weight toward the shoulder line keeps the angle
        // and depth consistent with body pose without dragging the collar down onto the chest.
        const neckBase = {
          x: chinPos.x + (shoulderMid.x - chinPos.x) * 0.22,
          y: chinPos.y + (shoulderMid.y - chinPos.y) * 0.22
        };
        targetPos = {
          x: neckBase.x + (offsetX * (canvas.width * 0.01)),
          y: neckBase.y + (offsetY * (canvas.height * 0.01))
        };
        // Scale off shoulder width (the true body-scale reference for THIS person/photo)
        // combined with this necklace design's own proportions — every combination of
        // "this neck size" x "this necklace shape" gets its own natural-looking scale.
        targetWidth = shoulderWidthPx * neckWidthFraction;
        maxHt = faceHeightPx * 1.1;
        userAngle = shoulderAngle + (rotation * Math.PI) / 180;
      } else if (hasShoulders) {
        // Body visible but no face crop (e.g. full-body shot with distant/undetected face)
        targetPos = {
          x: shoulderMid.x + (offsetX * (canvas.width * 0.01)),
          y: shoulderMid.y - shoulderWidthPx * 0.28 + (offsetY * (canvas.height * 0.01))
        };
        targetWidth = shoulderWidthPx * neckWidthFraction;
        userAngle = shoulderAngle + (rotation * Math.PI) / 180;
      } else if (hasLandmarks) {
        // Fallback: no body pose detected (tight close-up) — estimate from face only.
        const chinPos = p(landmarks[152]);
        const foreheadPos = p(landmarks[10]);
        const faceAxis = {
          x: (chinPos.x - foreheadPos.x) / faceHeightPx,
          y: (chinPos.y - foreheadPos.y) / faceHeightPx
        };
        const neckDrop = faceHeightPx * 0.35;
        targetPos = {
          x: chinPos.x + faceAxis.x * neckDrop + (offsetX * (canvas.width * 0.01)),
          y: chinPos.y + faceAxis.y * neckDrop + (offsetY * (canvas.height * 0.01))
        };
        targetWidth = faceWidthPx * 1.6;
        maxHt = faceHeightPx * 1.25;
      } else {
        // Last-resort fallback: no landmarks of any kind.
        targetPos = {
          x: canvas.width * 0.5 + (offsetX * (canvas.width * 0.01)),
          y: canvas.height * 0.7 + (offsetY * (canvas.height * 0.01))
        };
        targetWidth = canvas.width * 0.38;
      }

      // Curve the necklace around the neck's cylindrical shape instead of pasting it
      // flat — proportional to its own drawn width, so the wrap looks right whether
      // the piece rendered large or small, on a slim or wide neck.
      const necklaceCurveDepth = targetWidth * 0.09;
      drawJewelryPiece(targetPos, targetWidth, userAngle, maxHt, necklaceCurveDepth);

      // Neck occlusion / layering stamp: copies neck area from raw photo and covers necklace
      // so the chain/rear strand looks like it's actually wrapping behind the neck.
      if (occlusionEnabled && hasLandmarks) {
        const chinPos = p(landmarks[152]);
        const leftEarPos = p(landmarks[234]);
        const rightEarPos = p(landmarks[454]);

        ctx.save();
        ctx.beginPath();
        // Start left ear lobe
        ctx.moveTo(leftEarPos.x, leftEarPos.y);

        // Jawline points
        const jawlineIndices = [93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];
        jawlineIndices.forEach(idx => {
          if (landmarks[idx]) {
            const pt = p(landmarks[idx]);
            ctx.lineTo(pt.x, pt.y);
          }
        });

        // Loop boundaries below chin to envelope throat area. When shoulders are known,
        // drop to the real shoulder line (clamped by the user's occlusionHeight ceiling)
        // instead of a fixed face-height guess, so the mask follows the actual body.
        const faceBasedDrop = chinPos.y + faceHeightPx * (occlusionHeight * 0.01);
        const dropLimit = hasShoulders
          ? Math.min(faceBasedDrop, shoulderMid.y + shoulderWidthPx * 0.08)
          : faceBasedDrop;
        ctx.lineTo(rightEarPos.x, dropLimit);
        ctx.lineTo(leftEarPos.x, dropLimit);
        ctx.closePath();
        ctx.clip();

        // Print original photo neck pixels on top
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

    } else if (jewelry.category === "earrings") {
      if (hasLandmarks) {
        const leftEarPos = p(landmarks[234]);
        const rightEarPos = p(landmarks[454]);
        const earringWidth = faceWidthPx * 0.22;
        const earringMaxHeight = faceHeightPx * 0.35;

        // Left ear
        const leftLobe = {
          x: leftEarPos.x + (offsetX * (canvas.width * 0.01)),
          y: leftEarPos.y + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(leftLobe, earringWidth, userAngle, earringMaxHeight);

        // Right ear (inverted horizontal offset for styling symmetry)
        const rightLobe = {
          x: rightEarPos.x + (-offsetX * (canvas.width * 0.01)),
          y: rightEarPos.y + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(rightLobe, earringWidth, userAngle, earringMaxHeight);
      } else {
        // Fallback
        const leftE = {
          x: canvas.width * 0.4 + (offsetX * (canvas.width * 0.01)),
          y: canvas.height * 0.5 + (offsetY * (canvas.height * 0.01))
        };
        const rightE = {
          x: canvas.width * 0.6 + (-offsetX * (canvas.width * 0.01)),
          y: canvas.height * 0.5 + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(leftE, canvas.width * 0.06, userAngle);
        drawJewelryPiece(rightE, canvas.width * 0.06, userAngle);
      }

    } else if (jewelry.category === "nose-ring") {
      if (hasLandmarks) {
        const nostrilPos = p(landmarks[129]);
        const ringWidth = faceWidthPx * 0.22;
        const ringMaxHeight = faceHeightPx * 0.35;
        const noseLoc = {
          x: nostrilPos.x + (offsetX * (canvas.width * 0.01)),
          y: nostrilPos.y + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(noseLoc, ringWidth, userAngle, ringMaxHeight);
      } else {
        targetPos = {
          x: canvas.width * 0.5 + (offsetX * (canvas.width * 0.01)),
          y: canvas.height * 0.5 + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(targetPos, canvas.width * 0.08, userAngle);
      }

    } else if (jewelry.category === "maang-tikka") {
      if (hasLandmarks) {
        const foreheadPos = p(landmarks[10]);
        const tikkaWidth = faceWidthPx * 0.18;
        const tikkaMaxHeight = faceHeightPx * 0.45;
        const tikkaLoc = {
          x: foreheadPos.x + (offsetX * (canvas.width * 0.01)),
          y: foreheadPos.y + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(tikkaLoc, tikkaWidth, userAngle, tikkaMaxHeight);
      } else {
        targetPos = {
          x: canvas.width * 0.5 + (offsetX * (canvas.width * 0.01)),
          y: canvas.height * 0.35 + (offsetY * (canvas.height * 0.01))
        };
        drawJewelryPiece(targetPos, canvas.width * 0.06, userAngle);
      }

    } else if (jewelry.category === "bangle") {
      const bangleWidth = hasLandmarks ? faceWidthPx * 0.6 : canvas.width * 0.15;
      const bangleHeight = hasLandmarks ? faceHeightPx * 0.6 : canvas.height * 0.15;
      targetPos = {
        x: canvas.width * 0.5 + (offsetX * (canvas.width * 0.01)),
        y: canvas.height * 0.70 + (offsetY * (canvas.height * 0.01))
      };
      drawJewelryPiece(targetPos, bangleWidth, userAngle, bangleHeight);

    } else if (jewelry.category === "ring") {
      const ringWidth = hasLandmarks ? faceWidthPx * 0.22 : canvas.width * 0.06;
      const ringHeight = hasLandmarks ? faceHeightPx * 0.22 : canvas.height * 0.06;
      targetPos = {
        x: canvas.width * 0.5 + (offsetX * (canvas.width * 0.01)),
        y: canvas.height * 0.75 + (offsetY * (canvas.height * 0.01))
      };
      drawJewelryPiece(targetPos, ringWidth, userAngle, ringHeight);
    }

    ctx.restore();
  }, [
    imgLoaded,
    jewelryLoaded,
    jewelry,
    scale,
    offsetX,
    offsetY,
    rotation,
    showOriginal,
    selectedPhotoType,
    brightness,
    contrast,
    saturation,
    hue,
    opacity,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    shadowOpacity,
    occlusionEnabled,
    occlusionHeight
  ]);

  // Click & Drag positioning arithmetic
  const handleStart = (clientX, clientY) => {
    if (!jewelry || showOriginal) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      offsetX: offsetX,
      offsetY: offsetY
    };
  };

  const handleMove = (clientX, clientY) => {
    if (!isDragging || !dragStartRef.current || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const dxPixels = (clientX - dragStartRef.current.x) * scaleX;
    const dyPixels = (clientY - dragStartRef.current.y) * scaleY;

    // Convert pixel movement to canvas dimension percentages
    const dxPercent = (dxPixels / canvasRef.current.width) * 100;
    const dyPercent = (dyPixels / canvasRef.current.height) * 100;

    setOffsetX(dragStartRef.current.offsetX + dxPercent);
    setOffsetY(dragStartRef.current.offsetY + dyPercent);
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;

    downloadGate.requestDownload(() => {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `jtai-${jewelry?.id || "preview"}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="space-y-6">

      {/* Visual Canvas Display Box */}
      <div className="relative surface flex flex-col items-center justify-center p-4">

        {/* Photo View Selector */}
        {userPhotos?.fullPhoto && (
          <div className="absolute top-4 right-4 flex bg-ink-950 border border-ink-700 z-10">
            <button
              onClick={() => setSelectedPhotoType("half")}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase transition-colors duration-150 ${
                selectedPhotoType === "half" ? "bg-accent-500 text-ink-50" : "text-ink-400 hover:text-ink-50"
              }`}
            >
              Photo A (Close-up)
            </button>
            <button
              onClick={() => setSelectedPhotoType("full")}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase transition-colors duration-150 border-l border-ink-700 ${
                selectedPhotoType === "full" ? "bg-accent-500 text-ink-50" : "text-ink-400 hover:text-ink-50"
              }`}
            >
              Photo B (Full Body)
            </button>
          </div>
        )}

        {/* Main Composition Canvas */}
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => e.touches?.[0] && handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => e.touches?.[0] && handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          className={`max-h-[420px] max-w-full object-contain transition-colors duration-150 bg-ink-950 ${
            jewelry ? "cursor-grab active:cursor-grabbing border border-ink-700" : ""
          }`}
          style={{ touchAction: "none" }}
        />

        {/* Floating Controls Overlay */}
        <div className="absolute bottom-4 left-4 flex space-x-2 z-10">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="p-3 bg-ink-950 hover:border-accent-500 text-ink-50 cursor-pointer duration-150 flex items-center justify-center border border-ink-700"
            title="Toggle Original Photo"
          >
            {showOriginal ? <EyeOff className="w-4 h-4 text-accent-500" /> : <Eye className="w-4 h-4" />}
          </button>

          <button
            onClick={handleDownload}
            className="p-3 bg-ink-50 hover:bg-accent-500 hover:text-ink-50 text-ink-950 font-bold cursor-pointer transition-colors duration-150 flex items-center justify-center border border-ink-50 hover:border-accent-500"
            title="Download Composited Try-On Image"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Active Item Title Card */}
        {jewelry && !showOriginal && (
          <div className="absolute top-4 left-4 bg-ink-950 border border-ink-700 px-4 py-2.5 text-left pointer-events-none">
            <p className="text-[10px] text-accent-500 font-bold uppercase tracking-widest leading-none">{jewelry.category}</p>
            <h5 className="text-xs font-display font-semibold text-ink-50 truncate max-w-[120px] mt-1">{jewelry.name}</h5>
          </div>
        )}

        {/* Jewelry image load failure notice */}
        {jewelry && !showOriginal && jewelryError && (
          <div className="absolute inset-x-4 bottom-20 bg-ink-950 border border-accent-500/40 px-4 py-3 text-center">
            <p className="text-xs text-accent-400 font-semibold">
              Couldn't load this jewelry image. It may be missing on the server — try another item or re-upload it in Admin Panel.
            </p>
          </div>
        )}
      </div>

      <LeadCaptureModal
        isOpen={downloadGate.isFormOpen}
        errors={downloadGate.errors}
        onSubmit={downloadGate.submit}
        onCancel={downloadGate.cancel}
      />
    </div>
  );
}
