import React, { useState, useRef, useEffect } from "react";
import { Upload, Camera, Trash2, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";
import { detectLandmarks } from "../utils/faceLandmarks";
import { validateDimensions, validateBrightnessAndContrast, validateFaceAlignment } from "../utils/photoValidation";
import ValidationStatus from "./ValidationStatus";

export default function PhotoUpload({ onValidationComplete }) {
  const [photoA, setPhotoA] = useState(null); // { file, preview, landmarks, width, height, steps: { resolution, lighting, face, symmetry } }
  const [photoB, setPhotoB] = useState(null);
  const [validatingA, setValidatingA] = useState(false);
  const [validatingB, setValidatingB] = useState(false);
  const [errorA, setErrorA] = useState("");
  const [errorB, setErrorB] = useState("");
  const [loadingModel, setLoadingModel] = useState(false);

  const fileInputARef = useRef(null);
  const fileInputBRef = useRef(null);

  // Default empty checks
  const initialSteps = {
    resolution: "pending",
    lighting: "pending",
    face: "pending",
    symmetry: "pending"
  };

  const handlePhotoUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    const setValidating = type === "A" ? setValidatingA : setValidatingB;
    const setError = type === "A" ? setErrorA : setErrorB;
    const setPhoto = type === "A" ? setPhotoA : setPhotoB;

    setError("");
    setValidating(true);
    setPhoto({
      file,
      preview: URL.createObjectURL(file),
      landmarks: null,
      width: 0,
      height: 0,
      steps: { ...initialSteps }
    });

    // Create helper image element to load proportions and analyze pixels
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const width = img.naturalWidth;
        const height = img.naturalHeight;

        // Step 1: Validate resolution
        const resVal = validateDimensions(width, height);
        const resolutionStep = resVal.success ? "success" : "error";
        
        setPhoto(prev => ({
          ...prev,
          width,
          height,
          steps: { ...prev.steps, resolution: resolutionStep }
        }));

        if (!resVal.success) {
          setError(resVal.message);
          setValidating(false);
          return;
        }

        // Step 2: Validate Brightness/Contrast
        const lightVal = await validateBrightnessAndContrast(img);
        const lightingStep = lightVal.success ? "success" : "error";

        setPhoto(prev => ({
          ...prev,
          steps: { ...prev.steps, lighting: lightingStep }
        }));

        if (!lightVal.success) {
          setError(lightVal.message);
          setValidating(false);
          return;
        }

        // Step 3: Run AI face alignment (critical for Photo A, standard check for Photo B)
        setLoadingModel(true);
        const faceLandmarks = await detectLandmarks(img);
        setLoadingModel(false);

        if (!faceLandmarks) {
          setPhoto(prev => ({
            ...prev,
            steps: { ...prev.steps, face: "error", symmetry: "error" }
          }));
          setError(type === "A" 
            ? "No face detected in close-up. Make sure your face is fully visible with clear focus."
            : "No face detected. Both photos require a clear human face reference."
          );
          setValidating(false);
          return;
        }

        // Face found
        setPhoto(prev => ({
          ...prev,
          landmarks: faceLandmarks,
          steps: { ...prev.steps, face: "success" }
        }));

        // Step 4: Validate symmetry
        const alignmentVal = validateFaceAlignment(faceLandmarks);
        const symmetryStep = alignmentVal.success ? "success" : "error";

        setPhoto(prev => ({
          ...prev,
          steps: { ...prev.steps, symmetry: symmetryStep }
        }));

        if (!alignmentVal.success) {
          setError(alignmentVal.message);
          setValidating(false);
          return;
        }

        // Validation passed!
        setPhoto(prev => ({
          ...prev,
          steps: {
            resolution: "success",
            lighting: "success",
            face: "success",
            symmetry: "success"
          }
        }));
        setValidating(false);

      } catch (err) {
        console.error(err);
        setError("Error validating image quality. Try another photo.");
        setLoadingModel(false);
        setValidating(false);
      }
    };
    img.onerror = () => {
      setError("Failed to parse image file. Ensure it is a valid JPG/PNG.");
      setValidating(false);
    };
  };

  const removePhoto = (type) => {
    if (type === "A") {
      setPhotoA(null);
      setErrorA("");
    } else {
      setPhotoB(null);
      setErrorB("");
    }
  };

  const isContinueEnabled = 
    photoA?.steps.resolution === "success" &&
    photoA?.steps.lighting === "success" &&
    photoA?.steps.face === "success" &&
    photoA?.steps.symmetry === "success" &&
    photoB?.steps.resolution === "success" &&
    photoB?.steps.lighting === "success" &&
    photoB?.steps.face === "success" &&
    photoB?.steps.symmetry === "success";

  const handleContinue = () => {
    if (isContinueEnabled) {
      onValidationComplete({
        halfPhoto: photoA,
        fullPhoto: photoB
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-8 px-4">
      {/* Introduction */}
      <div className="space-y-3">
        <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-ink-50">
          Begin Your <span className="text-accent-500">Try-On</span>
        </h2>
        <p className="max-w-xl text-ink-400 text-sm md:text-base">
          Upload two photos. Our AI computer-vision gate verifies details, lighting,
          and alignment before generating your jewelry try-on.
        </p>
      </div>

      {loadingModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90">
          <div className="surface-raised p-8 max-w-sm text-center space-y-4">
            <div className="w-10 h-10 border-2 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="font-display font-semibold text-lg text-ink-50">Initializing Vision AI</h3>
            <p className="text-xs text-ink-400">
              Fetching MediaPipe model weights and setting up edge detection shaders. This takes a few seconds...
            </p>
          </div>
        </div>
      )}

      {/* Grid containing Dropzones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Photo A — Half Body */}
        <div className="space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="font-display text-lg text-ink-50 flex items-center space-x-2">
              <span className="inline-flex items-center justify-center w-6 h-6 border border-ink-50 text-ink-50 text-xs font-semibold">1</span>
              <span>Photo A: Close-Up (Face & Neck)</span>
            </h3>
            <p className="text-xs text-ink-400">
              Front-facing photo from chest-up. Neck, earlobes, and hairline must be clearly unobstructed.
            </p>
          </div>

          <div className="flex-1 flex flex-col min-h-[300px]">
            {photoA ? (
              <div className="relative flex-1 surface flex items-center justify-center">
                <img
                  src={photoA.preview}
                  alt="Close up preview"
                  className="max-h-[300px] object-contain w-full"
                />

                {/* Delete button */}
                <button
                  onClick={() => removePhoto("A")}
                  className="absolute top-4 right-4 p-2 bg-ink-950 hover:bg-accent-500 text-ink-50 transition-colors border border-ink-700 hover:border-accent-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputARef.current.click()}
                className="flex-1 border border-dashed border-ink-600 hover:border-accent-500 flex flex-col items-center justify-center p-6 bg-ink-900 cursor-pointer transition-colors duration-200 group"
              >
                <div className="p-4 border border-ink-700 group-hover:border-accent-500 transition-colors duration-200">
                  <Upload className="w-6 h-6 text-ink-400 group-hover:text-accent-500" />
                </div>
                <p className="mt-4 font-display text-sm font-semibold text-ink-50">Click or drag close-up photo</p>
                <p className="mt-1 text-[10px] text-ink-500">Supports JPG, PNG (min 500x500px)</p>
              </div>
            )}
            <input
              type="file"
              ref={fileInputARef}
              className="hidden"
              accept="image/*"
              onChange={(e) => handlePhotoUpload(e, "A")}
            />
          </div>

          {errorA && <p className="text-xs text-accent-400 bg-accent-500/5 border border-accent-500/20 p-3">{errorA}</p>}

          {photoA && (
            <ValidationStatus
              label="Close-Up"
              steps={photoA.steps}
              validating={validatingA}
            />
          )}
        </div>

        {/* Photo B — Full Body */}
        <div className="space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="font-display text-lg text-ink-50 flex items-center space-x-2">
              <span className="inline-flex items-center justify-center w-6 h-6 border border-ink-50 text-ink-50 text-xs font-semibold">2</span>
              <span>Photo B: Context / Full-body Photo</span>
            </h3>
            <p className="text-xs text-ink-400">
              Full-body or waist-up photo. Provides outfit context and alignment vectors. Must contain face.
            </p>
          </div>

          <div className="flex-1 flex flex-col min-h-[300px]">
            {photoB ? (
              <div className="relative flex-1 surface flex items-center justify-center">
                <img
                  src={photoB.preview}
                  alt="Full match preview"
                  className="max-h-[300px] object-contain w-full"
                />

                {/* Delete button */}
                <button
                  onClick={() => removePhoto("B")}
                  className="absolute top-4 right-4 p-2 bg-ink-950 hover:bg-accent-500 text-ink-50 transition-colors border border-ink-700 hover:border-accent-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputBRef.current.click()}
                className="flex-1 border border-dashed border-ink-600 hover:border-accent-500 flex flex-col items-center justify-center p-6 bg-ink-900 cursor-pointer transition-colors duration-200 group"
              >
                <div className="p-4 border border-ink-700 group-hover:border-accent-500 transition-colors duration-200">
                  <Upload className="w-6 h-6 text-ink-400 group-hover:text-accent-500" />
                </div>
                <p className="mt-4 font-display text-sm font-semibold text-ink-50">Click or drag full photo</p>
                <p className="mt-1 text-[10px] text-ink-500">Supports JPG, PNG (min 500x500px)</p>
              </div>
            )}
            <input
              type="file"
              ref={fileInputBRef}
              className="hidden"
              accept="image/*"
              onChange={(e) => handlePhotoUpload(e, "B")}
            />
          </div>

          {errorB && <p className="text-xs text-accent-400 bg-accent-500/5 border border-accent-500/20 p-3">{errorB}</p>}

          {photoB && (
            <ValidationStatus
              label="Full-Body"
              steps={photoB.steps}
              validating={validatingB}
            />
          )}
        </div>

      </div>

      {/* Continuation check button */}
      <div className="flex flex-col items-center pt-6 border-t border-ink-700 space-y-4">
        <button
          onClick={handleContinue}
          disabled={!isContinueEnabled}
          className={`flex items-center space-x-2 px-8 py-3.5 text-base font-semibold tracking-wide transition-colors duration-200 border ${
            isContinueEnabled
              ? "bg-accent-500 border-accent-500 text-ink-50 cursor-pointer hover:bg-accent-600"
              : "bg-ink-900 text-ink-500 cursor-not-allowed border-ink-700"
          }`}
        >
          <span>Proceed to Virtual try-on</span>
          <ArrowRight className="w-5 h-5" />
        </button>
        {!isContinueEnabled && (
          <span className="text-xs text-ink-500 flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-ink-500" />
            <span>Complete analysis checks for both Photo A and Photo B to enable trial.</span>
          </span>
        )}
      </div>
    </div>
  );
}
