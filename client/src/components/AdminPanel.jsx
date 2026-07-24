import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, ToggleLeft, ToggleRight, HelpCircle,
  Loader2, CheckCircle2, XCircle, UploadCloud, ExternalLink, Check
} from "lucide-react";
// NOTE: Firebase Firestore/Storage are not enabled on the project yet.
// Jewelry is persisted via the local Express API (server/server.js), which
// writes images to server/public/jewelry and metadata to server/data/jewelry.json
// — this survives page refreshes and server restarts, unlike the old in-memory
// store. Swap back to Firebase once Firestore/Storage are enabled:
// import { fetchAllJewelry, addJewelryItem, toggleJewelryActive, deleteJewelryItem } from "../firebase/firestore";
// import { uploadJewelryImage, deleteStorageFile } from "../firebase/storage";

const API_BASE = "http://localhost:5000";

const CATEGORIES = ["necklace", "earrings", "nose-ring", "maang-tikka", "bangle", "ring"];

// Alternate keywords that map to a canonical category (for filename detection)
const CATEGORY_ALIASES = {
  necklace:     ["necklace", "neck"],
  earrings:     ["earring", "earrings", "stud", "studs", "jhumka", "jhumkas"],
  "nose-ring":  ["nose-ring", "nosering", "nose_ring", "nath"],
  "maang-tikka": ["maang-tikka", "maangtikka", "maang_tikka", "tikka"],
  bangle:       ["bangle", "bangles", "kada"],
  ring:         ["ring", "rings"],
};

/** Derive a human-readable name and a category guess from a filename. */
const parseFilename = (filename) => {
  const base = filename.replace(/\.[^/.]+$/, ""); // strip extension
  const words = base.split(/[-_\s]+/).filter(Boolean);

  let matchedCategory = null;
  const nameWords = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (!matchedCategory) {
      const found = Object.entries(CATEGORY_ALIASES).find(([, aliases]) =>
        aliases.includes(lower)
      );
      if (found) {
        matchedCategory = found[0];
        continue; // don't include the category keyword in the display name
      }
    }
    nameWords.push(word);
  }

  const name = nameWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return { name, category: matchedCategory };
};

export default function AdminPanel() {
  const [jewelryList, setJewelryList]   = useState([]);
  const [listLoading, setListLoading]   = useState(true);

  // Form state
  const [name,      setName]      = useState("");
  const [category,  setCategory]  = useState("necklace");
  const [price,     setPrice]     = useState("");
  const [tags,      setTags]      = useState("");
  const [active,    setActive]    = useState(true);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [anchor,    setAnchor]    = useState({ x: 0.5, y: 0.5 });

  // Upload state
  const [progress,   setProgress]   = useState(0);
  const [submitting, setSubmitting]  = useState(false);
  const [message,    setMessage]     = useState({ text: "", type: "" });

  // AI detection state — runs the moment an image is selected, auto-filling
  // Name/Category so the admin never has to identify pieces by hand. When the
  // photo shows a full set (multiple piece types together), `detectedPieces`
  // holds one { category, name } per piece. The admin can either pick a single
  // piece to catalogue (via the form above) or, when there's more than one,
  // edit each piece's name in `pieceSelections` and submit all of them at once
  // — same source image, one catalog entry per included piece — instead of
  // re-uploading the same photo N times.
  const [detecting, setDetecting] = useState(false);
  const [detectionNote, setDetectionNote] = useState("");
  const [detectedPieces, setDetectedPieces] = useState([]);
  const [pieceSelections, setPieceSelections] = useState([]); // [{ category, name, included }]
  const [submittingAll, setSubmittingAll] = useState(false);
  const [submitAllProgress, setSubmitAllProgress] = useState({ done: 0, total: 0 });

  const previewCanvasRef = useRef(null);
  const fileInputRef     = useRef(null);

  // ── Fetch jewelry catalog from the local Express API ────────
  const fetchList = async () => {
    setListLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/jewelry/admin`);
      const items = await res.json();
      setJewelryList(items.map((item) => ({ ...item, imageUrl: `${API_BASE}${item.imageUrl}` })));
    } catch (err) {
      console.error("Failed to load jewelry catalog:", err);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  // ── Image file change ─────────────────────────────────────
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAnchor({ x: 0.5, y: 0.5 });
    setDetectionNote("");
    setDetectedPieces([]);
    setPieceSelections([]);

    // Instant fallback while the AI call is in flight, in case it fails or is slow.
    const { name: guessedName, category: guessedCategory } = parseFilename(file.name);
    if (guessedName && !name) setName(guessedName);
    if (guessedCategory) setCategory(guessedCategory);

    detectJewelry(file);
  };

  // ── AI vision detection — looks at the image and identifies every distinct
  // jewelry piece type present (a photo may show a full set: necklace +
  // earrings + tikka together) plus a short product name for each. Runs
  // automatically the moment an image is selected; overrides the instant
  // filename-based guess above once it resolves. When more than one piece
  // type is found, `detectedPieces` is populated so the UI can offer chips
  // letting the admin pick which piece is the actual product — the AI's
  // `suggestedPrimary` is only a starting point.
  const detectJewelry = async (file) => {
    setDetecting(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`${API_BASE}/api/jewelry/detect`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Detection failed.");
      }

      const pieces = data.pieces || [];
      setDetectedPieces(pieces);
      setPieceSelections(pieces.map((p) => ({ category: p.category, name: p.name, included: true })));
      applyDetectedPiece(pieces, data.suggestedPrimary);

      setDetectionNote(
        pieces.length > 1
          ? "AI found multiple pieces in this photo — edit the names below and submit them all at once, or pick just one above."
          : `AI identified this as: ${data.suggestedPrimary}.`
      );
    } catch (err) {
      console.warn("AI jewelry detection unavailable, keeping filename-based guess:", err);
      setDetectionNote("Couldn't auto-detect this image — please check Name/Category manually.");
    } finally {
      setDetecting(false);
    }
  };

  // Applies one detected piece's category+name to the form fields. Used both
  // right after detection (with the AI's suggested primary) and whenever the
  // admin clicks a different category chip to override that suggestion.
  const applyDetectedPiece = (pieces, category) => {
    const match = pieces.find((p) => p.category === category) || pieces[0];
    if (!match) return;
    setCategory(match.category);
    setName(match.name);
  };

  // ── Anchor click on canvas ──────────────────────────────────
  const handlePreviewClick = (e) => {
    if (!previewCanvasRef.current) return;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const pctX = parseFloat(Math.min(Math.max((e.clientX - rect.left) / rect.width,  0), 1).toFixed(3));
    const pctY = parseFloat(Math.min(Math.max((e.clientY - rect.top)  / rect.height, 0), 1).toFixed(3));
    setAnchor({ x: pctX, y: pctY });
  };

  // Re-draw preview canvas with anchor crosshair
  useEffect(() => {
    if (!imagePreview || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx    = canvas.getContext("2d");
    const img    = new Image();
    img.onerror  = () => {
      console.error("Preview image failed to load:", imagePreview);
      setMessage({ text: "Couldn't preview this image — try a different PNG file.", type: "error" });
    };
    img.src      = imagePreview;
    img.onload   = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const ax = anchor.x * canvas.width;
      const ay = anchor.y * canvas.height;

      ctx.beginPath();
      ctx.arc(ax, ay, 14, 0, 2 * Math.PI);
      ctx.strokeStyle = "#FF5C5C";
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ax, ay, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#FF5C5C";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ax - 22, ay);
      ctx.lineTo(ax + 22, ay);
      ctx.moveTo(ax, ay - 22);
      ctx.lineTo(ax, ay + 22);
      ctx.strokeStyle = "#FF5C5C";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    };
  }, [imagePreview, anchor]);

  // Posts one catalog entry for the given name/category, reusing the same
  // uploaded image file, tags, price, active flag, and anchor point. Shared
  // by the single-item submit and the "submit all detected pieces" flow below
  // — both create a catalog entry the exact same way, just for different
  // name/category pairs off the same source photo.
  const uploadOneItem = async (itemName, itemCategory) => {
    const formData = new FormData();
    formData.append("jewelryImage", imageFile);
    formData.append("name", itemName);
    formData.append("category", itemCategory);
    formData.append("tags", tags);
    formData.append("price", price);
    formData.append("active", active);
    formData.append("anchorPoint", JSON.stringify(anchor));

    const res = await fetch(`${API_BASE}/api/jewelry`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  };

  const resetForm = () => {
    setName(""); setPrice(""); setTags(""); setActive(true);
    setImageFile(null); setImagePreview(null); setAnchor({ x: 0.5, y: 0.5 });
    setDetectedPieces([]); setPieceSelections([]); setDetectionNote("");
  };

  // ── Submit (single item — whatever's currently in the form) ────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile) {
      setMessage({ text: "Please upload a transparent PNG design image.", type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "", type: "" });
    setProgress(0);

    try {
      await uploadOneItem(name, category);
      setProgress(100);
      setMessage({ text: "✅ Jewelry saved permanently to server/public/jewelry.", type: "success" });
      resetForm();
      fetchList();
    } catch (err) {
      console.error(err);
      setMessage({ text: `Failed: ${err.message}`, type: "error" });
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  };

  // Toggles a piece row's name-editing input.
  const updatePieceSelection = (idx, patch) => {
    setPieceSelections((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  // ── Submit all included pieces from one multi-piece photo — one catalog
  // entry per piece, same source image, sequentially so progress can be shown
  // and one failure doesn't lose the others already saved. ────────────────
  const handleSubmitAllPieces = async () => {
    const included = pieceSelections.filter((p) => p.included && p.name.trim());
    if (!imageFile || included.length === 0) return;

    setSubmittingAll(true);
    setMessage({ text: "", type: "" });
    setSubmitAllProgress({ done: 0, total: included.length });

    let failures = 0;
    for (let i = 0; i < included.length; i++) {
      try {
        await uploadOneItem(included[i].name.trim(), included[i].category);
      } catch (err) {
        console.error(`Failed to save "${included[i].name}":`, err);
        failures++;
      }
      setSubmitAllProgress({ done: i + 1, total: included.length });
    }

    setMessage(
      failures === 0
        ? { text: `✅ Saved all ${included.length} pieces to the catalog.`, type: "success" }
        : { text: `Saved ${included.length - failures} of ${included.length} pieces — ${failures} failed, see console.`, type: "error" }
    );
    resetForm();
    fetchList();
    setSubmittingAll(false);
  };

  // ── Toggle active ──────────────────────────────────────────
  const handleToggle = async (id, current) => {
    try {
      await fetch(`${API_BASE}/api/jewelry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !current }),
      });
      fetchList();
    } catch (err) {
      console.error(err);
    }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (item) => {
    if (!window.confirm(`Permanently delete "${item.name}"?`)) return;
    try {
      await fetch(`${API_BASE}/api/jewelry/${item.id}`, { method: "DELETE" });
      fetchList();
    } catch (err) {
      console.error(err);
    }
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8 animate-fade-in text-left">
      {/* Header */}
      <div className="border-b border-ink-700 pb-4">
        <h2 className="text-3xl font-display font-bold text-ink-50 tracking-tight">
          Admin <span className="text-accent-500">Catalog Dashboard</span>
        </h2>
        <p className="text-xs text-ink-400 mt-1">
          Upload jewelry — saved permanently to server/public/jewelry.
          Click on the image preview to set the alignment anchor point.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ── Upload Form ──────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-6">
          <div className="surface p-6 space-y-5">
            <h3 className="font-display text-lg text-ink-50 font-semibold flex items-center space-x-2">
              <Plus className="w-5 h-5 text-accent-500" />
              <span>Add Jewelry Item</span>
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">

              {/* Name */}
              <div className="space-y-1">
                <label className="text-ink-400 font-medium">Name</label>
                <input
                  type="text" required
                  placeholder="e.g. Dazzling Gold Studs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-ink-950 border border-ink-700 px-4 py-2.5 text-ink-50 focus:outline-none focus:border-accent-500 transition-colors"
                />
              </div>

              {/* Category + Price */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-ink-400 font-medium">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-ink-950 border border-ink-700 px-3 py-2.5 text-ink-50 capitalize focus:outline-none focus:border-accent-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c.replace("-", " ")}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-ink-400 font-medium">Price (USD)</label>
                  <input
                    type="number" placeholder="2500"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-ink-950 border border-ink-700 px-4 py-2.5 text-ink-50 focus:border-accent-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1">
                <label className="text-ink-400 font-medium">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="modern, heavy, trending, bridal"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full bg-ink-950 border border-ink-700 px-4 py-2.5 text-ink-50 focus:border-accent-500 focus:outline-none transition-colors"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-2 border-y border-ink-700">
                <span className="text-ink-400 font-medium">Publish in Catalog</span>
                <button type="button" onClick={() => setActive(!active)} className="transition-colors">
                  {active
                    ? <span className="flex items-center text-ink-50 font-semibold space-x-1.5"><ToggleRight className="w-6 h-6 text-accent-500" /><span>Active</span></span>
                    : <span className="flex items-center text-ink-500 space-x-1.5"><ToggleLeft className="w-6 h-6" /><span>Draft</span></span>
                  }
                </button>
              </div>

              {/* Image Upload */}
              <div className="space-y-1.5">
                <span className="block text-ink-400 font-medium">Jewelry PNG (transparent bg)</span>
                {imagePreview ? (
                  <div className="relative space-y-2">
                    <p className="text-[10px] text-accent-400 flex items-center space-x-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Click on the preview to position the anchor point.</span>
                    </p>
                    {detecting && (
                      <p className="text-[10px] text-ink-400 flex items-center space-x-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-accent-500" />
                        <span>AI is identifying this jewelry...</span>
                      </p>
                    )}
                    {!detecting && detectionNote && (
                      <p className="text-[10px] text-ink-400">{detectionNote}</p>
                    )}
                    {!detecting && detectedPieces.length > 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {detectedPieces.map((piece) => (
                          <button
                            key={piece.category}
                            type="button"
                            onClick={() => applyDetectedPiece(detectedPieces, piece.category)}
                            className={`px-2.5 py-1 text-[10px] font-semibold capitalize border transition-colors ${
                              category === piece.category
                                ? "bg-accent-500 border-accent-500 text-ink-50"
                                : "bg-ink-900 border-ink-700 text-ink-400 hover:border-accent-500"
                            }`}
                          >
                            {piece.category.replace("-", " ")}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Multi-piece set: edit each piece's name and submit them
                        all at once — same source image, one catalog entry per
                        included piece — instead of re-uploading N times. */}
                    {!detecting && pieceSelections.length > 1 && (
                      <div className="space-y-2 p-3 border border-ink-700 bg-ink-950">
                        <p className="text-[10px] text-ink-400 font-semibold uppercase tracking-wider">
                          Set names for all {pieceSelections.length} pieces
                        </p>
                        {pieceSelections.map((piece, idx) => (
                          <div key={piece.category} className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => updatePieceSelection(idx, { included: !piece.included })}
                              title={piece.included ? "Exclude from batch" : "Include in batch"}
                              className={`flex-shrink-0 w-5 h-5 flex items-center justify-center border transition-colors ${
                                piece.included
                                  ? "bg-accent-500 border-accent-500 text-ink-50"
                                  : "bg-ink-900 border-ink-700 text-ink-500"
                              }`}
                            >
                              {piece.included && <Check className="w-3 h-3 stroke-[3px]" />}
                            </button>
                            <span className="flex-shrink-0 text-[9px] text-ink-400 uppercase tracking-wider w-16 truncate capitalize">
                              {piece.category.replace("-", " ")}
                            </span>
                            <input
                              type="text"
                              value={piece.name}
                              onChange={(e) => updatePieceSelection(idx, { name: e.target.value })}
                              placeholder="Piece name"
                              disabled={!piece.included}
                              className="flex-1 min-w-0 bg-ink-900 border border-ink-700 px-2 py-1.5 text-ink-50 text-[10px] focus:outline-none focus:border-accent-500 disabled:opacity-40 transition-colors"
                            />
                          </div>
                        ))}

                        {submittingAll && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-ink-400">
                              <span>Saving pieces...</span>
                              <span className="text-accent-500 font-bold">{submitAllProgress.done}/{submitAllProgress.total}</span>
                            </div>
                            <div className="w-full h-1 bg-ink-700 overflow-hidden">
                              <div
                                className="h-full bg-accent-500 transition-all duration-300"
                                style={{ width: `${(submitAllProgress.done / Math.max(submitAllProgress.total, 1)) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleSubmitAllPieces}
                          disabled={submittingAll || pieceSelections.every((p) => !p.included || !p.name.trim())}
                          className={`w-full py-2 text-[10px] font-bold tracking-wide transition-colors flex items-center justify-center space-x-2 border ${
                            submittingAll || pieceSelections.every((p) => !p.included || !p.name.trim())
                              ? "bg-ink-900 text-ink-500 cursor-not-allowed border-ink-700"
                              : "bg-accent-500 border-accent-500 text-ink-50 hover:bg-accent-600 cursor-pointer"
                          }`}
                        >
                          {submittingAll
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Saving...</span></>
                            : <><Plus className="w-3.5 h-3.5" /><span>Submit All {pieceSelections.filter((p) => p.included).length} Pieces</span></>
                          }
                        </button>
                      </div>
                    )}
                    <div className="border border-ink-700 bg-ink-950 overflow-hidden flex items-center justify-center p-3">
                      <canvas
                        ref={previewCanvasRef}
                        onClick={handlePreviewClick}
                        className="max-h-[160px] max-w-full object-contain cursor-crosshair"
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-ink-400 px-1">
                      <span>Anchor:</span>
                      <span className="font-mono text-accent-500">X: {(anchor.x * 100).toFixed(1)}%, Y: {(anchor.y * 100).toFixed(1)}%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); setAnchor({ x: 0.5, y: 0.5 }); }}
                      className="w-full text-[10px] text-accent-400 hover:underline text-center"
                    >
                      Remove image
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-ink-600 hover:border-accent-500 p-5 bg-ink-900 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200 group"
                  >
                    <input ref={fileInputRef} type="file" accept="image/png,image/svg+xml,image/webp" hidden onChange={handleImageChange} />
                    <UploadCloud className="w-6 h-6 text-ink-500 group-hover:text-accent-500 mb-2 transition-colors" />
                    <span className="font-medium text-ink-400 group-hover:text-ink-50 transition-colors">Click to upload PNG</span>
                    <span className="text-[9px] text-ink-500 mt-1">Must have transparent background · Name &amp; Category auto-detected by AI</span>
                  </div>
                )}
              </div>

              {/* Upload progress */}
              {submitting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-ink-400">
                    <span>Uploading...</span>
                    <span className="text-accent-500 font-bold">{progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-ink-700 overflow-hidden">
                    <div
                      className="h-full bg-accent-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Message */}
              {message.text && (
                <div className={`p-3 border text-xs flex items-start space-x-2 ${
                  message.type === "success"
                    ? "bg-ink-800 border-ink-50/30 text-ink-50"
                    : "bg-accent-500/5 border-accent-500/30 text-accent-400"
                }`}>
                  {message.type === "success"
                    ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-3 font-bold tracking-wide transition-colors duration-150 flex items-center justify-center space-x-2 border ${
                  submitting
                    ? "bg-ink-900 text-ink-500 cursor-not-allowed border-ink-700"
                    : "bg-accent-500 border-accent-500 text-ink-50 hover:bg-accent-600 cursor-pointer"
                }`}
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Publishing...</span></>
                  : <><Plus className="w-4 h-4" /><span>Submit to Catalog</span></>
                }
              </button>
            </form>
          </div>
        </div>

        {/* ── Inventory Table ───────────────────────────────── */}
        <div className="lg:col-span-7">
          <div className="surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-ink-50 font-semibold">
                Inventory <span className="text-ink-500 text-sm font-sans font-normal">({jewelryList.length} items)</span>
              </h3>
              <button onClick={fetchList} className="text-xs text-ink-400 hover:text-ink-50 flex items-center space-x-1 border border-ink-700 hover:border-ink-500 px-3 py-1.5 transition-colors">
                <span>Refresh</span>
              </button>
            </div>

            {listLoading ? (
              <div className="py-16 flex flex-col items-center space-y-3 text-ink-500">
                <Loader2 className="w-6 h-6 animate-spin text-accent-500" />
                <span className="text-xs">Loading catalog...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-ink-700 text-ink-400">
                      <th className="pb-3 font-semibold">Preview</th>
                      <th className="pb-3 font-semibold">Product</th>
                      <th className="pb-3 font-semibold hidden sm:table-cell">Tags</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-800">
                    {jewelryList.map((item) => (
                      <tr key={item.id} className="group hover:bg-ink-900 transition-colors">
                        <td className="py-3 pr-3">
                          <div className="w-10 h-10 bg-ink-950 flex items-center justify-center p-1 border border-ink-700">
                            <img src={item.imageUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-display font-bold text-ink-50 max-w-[130px] truncate">{item.name}</p>
                          <p className="text-[10px] text-ink-400 uppercase tracking-widest capitalize mt-0.5">{item.category}</p>
                          {item.price && <p className="text-[10px] text-accent-500 mt-0.5">${item.price.toLocaleString()}</p>}
                        </td>
                        <td className="py-3 pr-3 hidden sm:table-cell max-w-[120px]">
                          <div className="flex flex-wrap gap-1">
                            {(item.tags || []).slice(0, 3).map((t) => (
                              <span key={t} className="bg-ink-800 border border-ink-700 px-1.5 py-0.5 text-[9px] text-ink-400">{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => handleToggle(item.id, item.active)}
                            className={`font-semibold cursor-pointer px-2.5 py-1 text-[9px] transition-colors border ${
                              item.active
                                ? "bg-ink-800 border-ink-50/30 text-ink-50 hover:border-ink-50"
                                : "bg-ink-900 border-ink-700 text-ink-500 hover:border-ink-500"
                            }`}
                          >
                            {item.active ? "Published" : "Draft"}
                          </button>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <a href={item.imageUrl} target="_blank" rel="noreferrer"
                              className="p-2 text-ink-500 hover:text-accent-500 transition-colors"
                              title="View image"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-2 text-ink-500 hover:text-accent-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {jewelryList.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-ink-500">
                          No items yet. Add your first jewelry piece above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
