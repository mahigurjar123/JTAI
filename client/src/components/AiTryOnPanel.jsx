import React, { useEffect } from "react";
import { Sparkles, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { useAiTryOnViewModel } from "../viewmodels/useAiTryOnViewModel";
import { useDownloadGateViewModel } from "../viewmodels/useDownloadGateViewModel";
import LeadCaptureModal from "./LeadCaptureModal";

// View: pure presentation. All generation state and logic lives in the
// ViewModel — this component only reads it and dispatches user actions.
// Generates a single result, composited on the full-body photo, wearing
// every currently-selected jewelry piece together; the close-up photo (if
// uploaded) is only used behind the scenes as a face-identity reference and
// never shown as its own separate output.
//
// Generation is explicit (Generate button) rather than auto-firing on every
// selection change — the user picks as many pieces (one per category) as
// they want stacked together first, then submits once.
export default function AiTryOnPanel({ userPhotos, jewelryItems = [], onGenerated }) {
  const { state, generate, reset } = useAiTryOnViewModel();
  const downloadGate = useDownloadGateViewModel();
  const { isGenerating, result, error } = state;

  const hasFullPhoto = !!userPhotos?.fullPhoto?.preview;
  const canGenerate = hasFullPhoto && jewelryItems.length > 0;

  const handleGenerate = () => {
    generate({ userPhotos, jewelryItems });
  };

  // Lets the parent know a generation just completed, so it can treat the
  // NEXT jewelry selection as a fresh start instead of stacking onto pieces
  // from this already-generated result.
  useEffect(() => {
    if (result?.imageUrl) onGenerated?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.imageUrl]);

  const handleDownload = () => {
    downloadGate.requestDownload(() => {
      const link = document.createElement("a");
      link.download = `jtai-ai-tryon-${Date.now()}.png`;
      link.href = result.imageUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="surface p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-ink-700 pb-3">
        <h4 className="font-display text-sm font-semibold tracking-wider text-ink-50 uppercase flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-accent-500" />
          <span>AI Generated Try-On</span>
        </h4>
        {result && (
          <button
            onClick={reset}
            className="text-[10px] font-bold text-ink-400 hover:text-accent-400 flex items-center space-x-1 border border-ink-700 hover:border-accent-500 px-2.5 py-1 transition-colors"
          >
            <RefreshCw className="w-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {!canGenerate && !isGenerating && !result && (
        <p className="text-xs text-ink-500 text-center py-8">
          Upload the full-body photo and select one or more jewelry pieces, then hit Generate.
        </p>
      )}

      {jewelryItems.length > 0 && !isGenerating && (
        <p className="text-[10px] text-ink-400 text-center -mb-1">
          {jewelryItems.length === 1
            ? `Wearing: ${jewelryItems[0].name}`
            : `Wearing ${jewelryItems.length} pieces: ${jewelryItems.map((j) => j.name).join(", ")}`}
        </p>
      )}

      {(canGenerate || result || isGenerating) && (
        <div className="relative bg-ink-950 border border-ink-700 min-h-[380px] flex items-center justify-center">
          {result?.imageUrl && (
            <img
              src={result.imageUrl}
              alt="AI-generated jewelry try-on"
              className="max-h-[520px] w-full object-contain"
            />
          )}

          {!result && !isGenerating && !error && (
            <p className="text-xs text-ink-500 px-6 text-center">Waiting to generate…</p>
          )}

          {isGenerating && (
            <div className="flex flex-col items-center space-y-3 text-ink-400">
              <div className="w-9 h-9 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-center px-4">Generating… this can take up to a minute.</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 border border-accent-500/30 bg-accent-500/5 text-xs text-accent-400 flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result?.imageUrl && (
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center space-x-2 p-2.5 bg-ink-50 hover:bg-accent-500 hover:text-ink-50 text-ink-950 font-bold cursor-pointer transition-colors border border-ink-50 hover:border-accent-500 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </button>
      )}

      <button
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating}
        className={`w-full flex items-center justify-center space-x-2 py-3 font-bold tracking-wide transition-colors duration-150 border ${
          !canGenerate || isGenerating
            ? "bg-ink-900 text-ink-500 cursor-not-allowed border-ink-700"
            : "bg-accent-500 border-accent-500 text-ink-50 hover:bg-accent-600 cursor-pointer"
        }`}
      >
        <Sparkles className="w-4 h-4" />
        <span>{isGenerating ? "Generating…" : result ? "Regenerate" : "Generate AI Try-On"}</span>
      </button>

      <LeadCaptureModal
        isOpen={downloadGate.isFormOpen}
        errors={downloadGate.errors}
        onSubmit={downloadGate.submit}
        onCancel={downloadGate.cancel}
      />
    </div>
  );
}
