import React, { useEffect, useRef } from "react";
import { Sparkles, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { useAiTryOnViewModel } from "../viewmodels/useAiTryOnViewModel";
import { useDownloadGateViewModel } from "../viewmodels/useDownloadGateViewModel";
import LeadCaptureModal from "./LeadCaptureModal";

function ResultSlot({ label, uploaded, slot, onDownload }) {
  const { isGenerating, result, error } = slot;

  return (
    <div className="space-y-3">
      <h5 className="text-[10px] font-bold tracking-widest uppercase text-ink-400">{label}</h5>

      <div className="relative bg-ink-950 border border-ink-700 min-h-[320px] flex items-center justify-center">
        {result?.imageUrl && (
          <img
            src={result.imageUrl}
            alt={`AI-generated jewelry try-on — ${label}`}
            className="max-h-[420px] w-full object-contain"
          />
        )}

        {!uploaded && !isGenerating && (
          <p className="text-xs text-ink-500 px-6 text-center">This photo wasn't uploaded.</p>
        )}

        {uploaded && !result && !isGenerating && !error && (
          <p className="text-xs text-ink-500 px-6 text-center">Waiting to generate…</p>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center space-y-3 text-ink-400">
            <div className="w-9 h-9 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-center px-4">Generating… this can take up to a minute.</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 border border-accent-500/30 bg-accent-500/5 text-xs text-accent-400 flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result?.imageUrl && (
        <button
          onClick={() => onDownload(result, label)}
          className="w-full flex items-center justify-center space-x-2 p-2.5 bg-ink-50 hover:bg-accent-500 hover:text-ink-50 text-ink-950 font-bold cursor-pointer transition-colors border border-ink-50 hover:border-accent-500 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </button>
      )}
    </div>
  );
}

// View: pure presentation. All generation state and logic lives in the
// ViewModel — this component only reads it and dispatches user actions.
// Both uploaded photos (close-up + full-body) are generated in parallel and
// shown side by side, so the user sees the try-on result for each.
export default function AiTryOnPanel({ userPhotos, jewelry }) {
  const { half, full, generate, reset } = useAiTryOnViewModel();
  const downloadGate = useDownloadGateViewModel();

  const hasAnyPhoto = !!userPhotos?.halfPhoto?.preview || !!userPhotos?.fullPhoto?.preview;
  const canGenerate = hasAnyPhoto && !!jewelry?.imageUrl;
  const isGenerating = half.isGenerating || full.isGenerating;
  const hasAnyResult = !!half.result || !!full.result;

  const handleGenerate = () => {
    generate({ userPhotos, jewelry });
  };

  // Auto-generate the moment a new jewelry item is selected — the user should
  // never have to press a button after picking a product. Guarded by jewelry.id
  // (not the whole object) so re-renders with the same selection don't re-fire.
  const lastGeneratedForRef = useRef(null);
  useEffect(() => {
    if (!jewelry?.id || !hasAnyPhoto) return;
    if (lastGeneratedForRef.current === jewelry.id) return;

    lastGeneratedForRef.current = jewelry.id;
    generate({ userPhotos, jewelry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jewelry?.id, hasAnyPhoto]);

  const handleDownload = (result, label) => {
    downloadGate.requestDownload(() => {
      const link = document.createElement("a");
      link.download = `jtai-ai-${jewelry?.id || "tryon"}-${label.replace(/\s+/g, "-").toLowerCase()}.png`;
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
        {hasAnyResult && (
          <button
            onClick={reset}
            className="text-[10px] font-bold text-ink-400 hover:text-accent-400 flex items-center space-x-1 border border-ink-700 hover:border-accent-500 px-2.5 py-1 transition-colors"
          >
            <RefreshCw className="w-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {!canGenerate && !isGenerating && !hasAnyResult && (
        <p className="text-xs text-ink-500 text-center py-8">
          Upload a photo and select a jewelry item to generate an AI try-on.
        </p>
      )}

      {(canGenerate || hasAnyResult) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ResultSlot
            label="Photo A — Close-Up"
            uploaded={!!userPhotos?.halfPhoto?.preview}
            slot={half}
            onDownload={handleDownload}
          />
          <ResultSlot
            label="Photo B — Full Body"
            uploaded={!!userPhotos?.fullPhoto?.preview}
            slot={full}
            onDownload={handleDownload}
          />
        </div>
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
        <span>{isGenerating ? "Generating…" : hasAnyResult ? "Regenerate Both" : "Generate AI Try-On"}</span>
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
