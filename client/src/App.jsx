import React, { useState } from "react";
import Navbar from "./components/Navbar";
import PhotoUpload from "./components/PhotoUpload";
import AiTryOnPanel from "./components/AiTryOnPanel";
import JewelrySelector from "./components/JewelrySelector";
import AdminPanel from "./components/AdminPanel";
import { RefreshCw } from "lucide-react";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("workbench");
  const [userPhotos, setUserPhotos] = useState(null); // { halfPhoto, fullPhoto }
  // Multiple pieces can be worn together (necklace + earrings + bangle...),
  // but only one item per category — selecting a new necklace replaces the
  // old one instead of stacking two necklaces.
  const [selectedJewelryItems, setSelectedJewelryItems] = useState([]);
  const [selectedMode, setSelectedMode] = useState(null); // "manual" | "auto"
  const [wishlist, setWishlist] = useState([]); // Array of jewelry IDs

  const toggleWishlist = (item) => {
    setWishlist((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
    );
  };

  const toggleJewelrySelection = (item) => {
    setSelectedJewelryItems((prev) => {
      const alreadySelected = prev.some((j) => j.id === item.id);
      if (alreadySelected) {
        return prev.filter((j) => j.id !== item.id);
      }
      return [...prev.filter((j) => j.category !== item.category), item];
    });
  };

  const handleResetPhotos = () => {
    if (window.confirm("Do you want to clear your current photos and upload new ones?")) {
      setUserPhotos(null);
      setSelectedJewelryItems([]);
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

                  {/* Left Column: AI Generated Try-On */}
                  <div className="lg:col-span-7 space-y-4">
                    <AiTryOnPanel
                      userPhotos={userPhotos}
                      jewelryItems={selectedJewelryItems}
                    />
                  </div>

                  {/* Right Column: Mode selection & Catalog search */}
                  <div className="lg:col-span-5 surface p-6 space-y-6">
                    <JewelrySelector
                      userPhotos={userPhotos}
                      selectedItems={selectedJewelryItems}
                      onToggleJewelry={toggleJewelrySelection}
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
