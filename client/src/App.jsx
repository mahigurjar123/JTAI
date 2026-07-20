import React, { useState } from "react";
import Navbar from "./components/Navbar";
import PhotoUpload from "./components/PhotoUpload";
import OverlayCanvas from "./components/OverlayCanvas";
import AiTryOnPanel from "./components/AiTryOnPanel";
import JewelrySelector from "./components/JewelrySelector";
import AdminPanel from "./components/AdminPanel";
import { RefreshCw, Layers, Sparkles } from "lucide-react";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("workbench");
  const [userPhotos, setUserPhotos] = useState(null); // { halfPhoto, fullPhoto }
  const [selectedJewelry, setSelectedJewelry] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null); // "manual" | "auto"
  const [wishlist, setWishlist] = useState([]); // Array of jewelry IDs
  const [tryOnEngine, setTryOnEngine] = useState("ai"); // "canvas" | "ai"

  const toggleWishlist = (item) => {
    setWishlist((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
    );
  };

  const handleResetPhotos = () => {
    if (window.confirm("Do you want to clear your current photos and upload new ones?")) {
      setUserPhotos(null);
      setSelectedJewelry(null);
      setSelectedMode(null);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col font-sans">
      {/* Brand Header */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6">
        {activeTab === "admin" ? (
          <AdminPanel />
        ) : (
          /* Workbench Tab */
          <div>
            {!userPhotos ? (
              /* Photo Upload Screen */
              <PhotoUpload onValidationComplete={setUserPhotos} />
            ) : (
              /* Active Try-On Workbench Split screen */
              <div className="space-y-6 animate-fade-in">
                {/* Workbench Top Bar Options */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-ink-700 pb-4 gap-4 text-left">
                  <div>
                    <h3 className="text-2xl font-display font-bold text-ink-50 tracking-tight">
                      Virtual <span className="text-accent-500">Try-On Lab</span>
                    </h3>
                    <p className="text-xs text-ink-400 mt-1">
                      Select a piece from the catalog to instantly generate your try-on.
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    {wishlist.length > 0 && (
                      <span className="flex items-center space-x-1.5 text-xs px-3 py-1.5 border border-ink-600 text-ink-200 font-semibold">
                        <span className="text-accent-500">♥</span>
                        <span>{wishlist.length} Saved</span>
                      </span>
                    )}
                    <button
                      onClick={handleResetPhotos}
                      className="flex items-center space-x-2 px-4 py-2 border border-ink-700 hover:border-ink-500 active:scale-95 duration-150 text-xs font-semibold text-ink-400 hover:text-ink-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Upload New Photos</span>
                    </button>
                  </div>
                </div>

                {/* Split layout: Canvas Workbench + Selection Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                  {/* Left Column: Composed Output Canvas and adjustments */}
                  <div className="lg:col-span-7 space-y-4">
                    {/* Try-On Engine Selector */}
                    <div className="inline-flex border border-ink-700">
                      <button
                        onClick={() => setTryOnEngine("ai")}
                        className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold tracking-wide transition-colors duration-150 ${
                          tryOnEngine === "ai" ? "bg-accent-500 text-ink-50" : "text-ink-400 hover:text-ink-50"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI Generate</span>
                      </button>
                      <button
                        onClick={() => setTryOnEngine("canvas")}
                        className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold tracking-wide transition-colors duration-150 border-l border-ink-700 ${
                          tryOnEngine === "canvas" ? "bg-accent-500 text-ink-50" : "text-ink-400 hover:text-ink-50"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Live Preview</span>
                      </button>
                    </div>

                    {tryOnEngine === "canvas" ? (
                      <OverlayCanvas
                        userPhotos={userPhotos}
                        jewelry={selectedJewelry}
                      />
                    ) : (
                      <AiTryOnPanel
                        userPhotos={userPhotos}
                        jewelry={selectedJewelry}
                      />
                    )}
                  </div>

                  {/* Right Column: Mode selection & Catalog search */}
                  <div className="lg:col-span-5 surface p-6 space-y-6">
                    <JewelrySelector
                      userPhotos={userPhotos}
                      activeJewelry={selectedJewelry}
                      onSelectJewelry={setSelectedJewelry}
                      selectedMode={selectedMode}
                      setSelectedMode={setSelectedMode}
                      wishlist={wishlist}
                      onToggleWishlist={toggleWishlist}
                    />
                  </div>

                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-ink-500 text-xs border-t border-ink-700 mt-12 bg-ink-950">
        <p className="font-display tracking-[0.2em] text-[10px] text-ink-400 font-semibold mb-1">
          JTAI — JEWELRY TRY-ON AI
        </p>
        <p>© 2026 JTAI. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
