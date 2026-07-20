import React, { useState, useEffect } from "react";
import { Sparkles, Check, Grid, ArrowLeft, Heart, Tag } from "lucide-react";
const API_BASE = "http://localhost:5000";

export default function JewelrySelector({ 
  userPhotos, 
  onSelectJewelry, 
  activeJewelry, 
  selectedMode, 
  setSelectedMode,
  wishlist = [],
  onToggleWishlist
}) {
  const [jewelryList, setJewelryList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("all");
  const [aiReport, setAiReport] = useState(null);
  const [aiSelecting, setAiSelecting] = useState(false);

  // Fetch active jewelry from the local Express API (server/public/jewelry +
  // server/data/jewelry.json — persists across refreshes/restarts).
  // Swap back to Firebase Firestore once it's enabled on the project.
  useEffect(() => {
    fetch(`${API_BASE}/api/jewelry`)
      .then((res) => res.json())
      .then((data) =>
        setJewelryList(data.map((item) => ({ ...item, imageUrl: `${API_BASE}${item.imageUrl}` })))
      )
      .catch((err) => console.error("Error loading jewelry catalog", err));
  }, []);

  // AI Recommendation Engine
  const runAiRecommender = () => {
    if (!userPhotos || !userPhotos.halfPhoto || !userPhotos.halfPhoto.landmarks) return;
    
    setAiSelecting(true);
    
    // Simulate AI computing
    setTimeout(() => {
      const landmarks = userPhotos.halfPhoto.landmarks[0];
      
      // Select landmarks (MediaPipe Indexes: 10 = forehead hairline, 152 = chin, 33 = left eye, 263 = right eye)
      const forehead = landmarks[10];
      const chin = landmarks[152];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      
      // Calculate face proportions
      const faceHeight = Math.sqrt(Math.pow(chin.x - forehead.x, 2) + Math.pow(chin.y - forehead.y, 2));
      const faceWidth = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2)) * 2; // Approximate width from temple to temple
      const ratio = faceHeight / faceWidth;
      
      let faceShape = "Oval";
      let description = "Balanced features. Almost any jewelry styling will look exquisite on you.";
      let suggestedCategory = "necklace"; // fallback
      let filterTag = "trending";
      
      if (ratio > 1.25) {
        faceShape = "Oblong / Heart";
        description = "Longer structure. Recommending round/choker neck pieces and wide studs to create harmonious proportions.";
        suggestedCategory = "necklace";
        filterTag = "heavy";
      } else if (ratio < 1.05) {
        faceShape = "Round / Square";
        description = "Chiseled parameters. Recommending elongated teardrop earrings and V-neck styles to offset angular contours.";
        suggestedCategory = "earrings";
        filterTag = "minimal";
      } else {
        faceShape = "Oval";
        description = "Perfect symmetrical proportions. Recommending royal Statement pieces and Kundan details.";
        suggestedCategory = "necklace";
        filterTag = "bridal";
      }
      
      // Find matching items from catalog
      const matches = jewelryList.filter(item => 
        item.tags.includes(filterTag) || 
        item.category === suggestedCategory
      );
      
      // Select the best candidate (default to first or random match)
      const chosenItem = matches.length > 0 
        ? matches[Math.floor(Math.random() * matches.length)] 
        : jewelryList[0];
      
      setAiReport({
        faceShape,
        ratio: ratio.toFixed(2),
        description,
        recommendedTag: filterTag,
        recommendations: matches.slice(0, 3)
      });
      
      if (chosenItem) {
        onSelectJewelry(chosenItem);
      }
      
      setAiSelecting(false);
    }, 2800);
  };

  // Trigger AI recommender when mode changes to Auto
  useEffect(() => {
    if (selectedMode === "auto" && jewelryList.length > 0) {
      runAiRecommender();
    }
  }, [selectedMode, jewelryList]);

  // Categories list
  const categories = [
    { value: "all", label: "All Items" },
    { value: "necklace", label: "Necklaces" },
    { value: "earrings", label: "Earrings" },
    { value: "nose-ring", label: "Nose Rings" },
    { value: "maang-tikka", label: "Tikkas" },
    { value: "bangle", label: "Bangles" },
    { value: "ring", label: "Rings" },
    { value: "wishlist", label: `♥ Saved${wishlist.length > 0 ? ` (${wishlist.length})` : ""}` }
  ];

  const filteredJewelry = category === "all" 
    ? jewelryList 
    : category === "wishlist"
    ? jewelryList.filter(j => wishlist.includes(j.id))
    : jewelryList.filter(j => j.category === category);

  // 1. Initial Mode Selector UI (Two big buttons)
  if (!selectedMode) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 space-y-8 animate-fade-in">
        <div className="space-y-3">
          <h3 className="text-3xl font-display font-bold tracking-tight text-ink-50">
            Choose Your <span className="text-accent-500">Try-On Path</span>
          </h3>
          <p className="text-sm text-ink-400 max-w-md">
            Select manual browsing to explore the catalog at your own pace, or launch the Vision AI advisor for recommendations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">

          {/* Card 1: Manual Mode */}
          <div
            onClick={() => setSelectedMode("manual")}
            className="group surface relative p-8 flex flex-col items-center text-center cursor-pointer transition-colors duration-200 hover:border-accent-500"
          >
            <div className="w-14 h-14 border border-ink-700 flex items-center justify-center mb-6 group-hover:border-accent-500 transition-colors duration-200">
              <Grid className="w-6 h-6 text-ink-400 group-hover:text-accent-500 duration-200" />
            </div>

            <h4 className="font-display text-2xl font-semibold text-ink-50 tracking-tight mb-3">
              Select Jewelry Yourself
            </h4>
            <p className="text-sm text-ink-400 leading-relaxed">
              Manually browse our full catalog of jewelry. Toggle and stack different necklaces, earrings, and nose rings immediately.
            </p>

            <div className="mt-8 flex items-center space-x-2 text-xs font-semibold text-accent-500">
              <span>View Catalog</span>
              <span className="transform translate-x-0 group-hover:translate-x-1 duration-200">→</span>
            </div>
          </div>

          {/* Card 2: AI Auto Mode */}
          <div
            onClick={() => setSelectedMode("auto")}
            className="group surface relative p-8 flex flex-col items-center text-center cursor-pointer transition-colors duration-200 hover:border-accent-500"
          >
            <div className="absolute top-4 right-4 bg-accent-500 text-ink-50 text-[9px] font-bold tracking-widest px-2.5 py-1 uppercase">
              AI Powered
            </div>

            <div className="w-14 h-14 border border-ink-700 flex items-center justify-center mb-6 group-hover:border-accent-500 transition-colors duration-200">
              <Sparkles className="w-6 h-6 text-ink-400 group-hover:text-accent-500 duration-200" />
            </div>

            <h4 className="font-display text-2xl font-semibold text-ink-50 tracking-tight mb-3">
              Auto Select for Me
            </h4>
            <p className="text-sm text-ink-400 leading-relaxed">
              Let the system analyze your facial symmetry, structure ratios, and proportions to automatically choose the ideal jewelry.
            </p>

            <div className="mt-8 flex items-center space-x-2 text-xs font-semibold text-accent-500">
              <span>Launch AI Advisor</span>
              <span className="transform translate-x-0 group-hover:translate-x-1 duration-200">→</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // 2. Loading Auto mode / analyzing animation
  if (selectedMode === "auto" && aiSelecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-6">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 border border-ink-700" />
          <div className="absolute inset-1 border-t-2 border-r-2 border-accent-500 animate-spin" />
          <Sparkles className="w-7 h-7 text-accent-500 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold text-ink-50 tracking-tight">AI Recommendation Scan</h3>
          <p className="text-xs text-ink-400 max-w-xs mx-auto animate-pulse">
            Analyzing face metrics, boundary vectors, and skin tone illumination to recommend matching styles...
          </p>
        </div>
      </div>
    );
  }

  // 3. Main Try-On catalog interface (Grid / manual catalog OR AI response)
  return (
    <div className="space-y-6">

      {/* Return button */}
      <button
        onClick={() => {
          setSelectedMode(null);
          setAiReport(null);
        }}
        className="flex items-center space-x-2 text-xs text-ink-400 hover:text-ink-50 transition-colors bg-ink-900 border border-ink-700 hover:border-ink-500 px-3 py-1.5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Change Mode</span>
      </button>

      {selectedMode === "auto" && aiReport && (
        <div className="surface-raised p-5 space-y-5 animate-fade-in">
          <div className="flex items-center space-x-3">
            <div className="p-2 border border-ink-600">
              <Sparkles className="w-5 h-5 text-accent-500" />
            </div>
            <div>
              <h4 className="font-display text-base font-bold text-ink-50 leading-none">AI Advisor Report</h4>
              <p className="text-[10px] text-ink-400 mt-1">Symmetry calculation: height-width ratio {aiReport.ratio}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-ink-700 pb-2">
              <span className="text-ink-400">Classified Face type:</span>
              <span className="font-bold text-accent-500">{aiReport.faceShape}</span>
            </div>
            <p className="text-xs text-ink-300 leading-relaxed">
              {aiReport.description}
            </p>
          </div>

          <div className="pt-2 border-t border-ink-700">
            <h5 className="font-display text-xs font-semibold text-ink-50 tracking-wide mb-3">
              Matched Items Recommendation
            </h5>
            <div className="grid grid-cols-3 gap-3">
              {aiReport.recommendations.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectJewelry(item)}
                  className={`relative p-2 border flex flex-col items-center justify-center cursor-pointer transition-colors duration-150 ${
                    activeJewelry?.id === item.id
                      ? "border-accent-500 bg-accent-500/5"
                      : "border-ink-700 hover:border-ink-500 bg-ink-900"
                  }`}
                >
                  <img src={item.imageUrl} alt={item.name} className="w-12 h-12 object-contain" />
                  <p className="text-[9px] text-center font-medium mt-1 truncate w-full text-ink-300">{item.name}</p>
                  {activeJewelry?.id === item.id && (
                    <div className="absolute top-1 right-1 p-0.5 bg-accent-500">
                      <Check className="w-2.5 h-2.5 text-ink-50 stroke-[3px]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual / Full Catalog selector */}
      <div className="space-y-4">
        {selectedMode === "manual" && (
          <div className="flex items-center justify-between border-b border-ink-700 pb-3">
            <h4 className="font-display text-lg font-bold text-ink-50">Full Catalog</h4>
            <div className="text-xs text-ink-400 font-medium">
              {filteredJewelry.length} items found
            </div>
          </div>
        )}

        {/* Category Tabs (available in Manual, or if user wants to override AI) */}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors duration-150 border ${
                category === cat.value
                  ? "bg-accent-500 text-ink-50 border-accent-500"
                  : "bg-ink-900 hover:border-ink-500 text-ink-400 border-ink-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Catalog Items Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
          {filteredJewelry.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectJewelry(item)}
              className={`relative group border p-4 flex flex-col items-center justify-between cursor-pointer transition-colors duration-150 bg-ink-900 ${
                activeJewelry?.id === item.id
                  ? "border-accent-500 bg-accent-500/5"
                  : "border-ink-700 hover:border-ink-500"
              }`}
            >
              {/* Product Image */}
              <div className="w-20 h-20 flex items-center justify-center p-2 mb-2">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              {/* Product Info */}
              <div className="text-center w-full min-w-0">
                <p className="text-xs font-display text-ink-50 font-medium truncate leading-tight">
                  {item.name}
                </p>
                <p className="text-[10px] text-accent-500 mt-1 capitalize tracking-wider font-semibold">
                  {item.category.replace("-", " ")}
                </p>
                {item.price && (
                  <p className="text-[10px] text-ink-400 mt-0.5 flex items-center justify-center space-x-0.5">
                    <Tag className="w-2.5 h-2.5 inline" />
                    <span>${item.price.toLocaleString()}</span>
                  </p>
                )}
              </div>

              {/* Active selection tick */}
              {activeJewelry?.id === item.id && (
                <div className="absolute top-2.5 right-2.5 p-1 bg-accent-500 text-ink-50">
                  <Check className="w-3 h-3 stroke-[3px]" />
                </div>
              )}

              {/* Wishlist Heart button */}
              {onToggleWishlist && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleWishlist(item); }}
                  title={wishlist.includes(item.id) ? "Remove from saved" : "Save to wishlist"}
                  className={`absolute top-2.5 left-2.5 p-1 transition-colors duration-150 border ${
                    wishlist.includes(item.id)
                      ? "text-accent-500 bg-accent-500/10 border-accent-500"
                      : "text-ink-500 bg-ink-950 border-ink-700 opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Heart className={`w-3 h-3 ${wishlist.includes(item.id) ? "fill-current" : ""}`} />
                </button>
              )}
            </div>
          ))}

          {filteredJewelry.length === 0 && (
            <div className="col-span-full py-12 text-center text-ink-500 text-xs">
              {category === "wishlist"
                ? "No saved items yet. Click the ♥ on any jewelry to save it."
                : "No jewelry items currently available in this category."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
