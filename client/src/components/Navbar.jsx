import React from "react";
import { ShieldAlert, ShoppingBag } from "lucide-react";

export default function Navbar({ activeTab, setActiveTab }) {
  return (
    <header className="sticky top-0 z-50 w-full bg-ink-950 border-b border-ink-700 px-6 py-4 md:px-12 flex items-center justify-between">
      <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setActiveTab("workbench")}>
        <div className="flex items-center justify-center w-9 h-9 border border-ink-50 bg-ink-50 text-ink-950 group-hover:bg-accent-500 group-hover:border-accent-500 transition-colors">
          <span className="font-display font-bold text-sm">J</span>
        </div>
        <span className="font-display tracking-[0.3em] text-xl font-bold text-ink-50">
          JTAI
        </span>
      </div>

      <nav className="flex items-center space-x-1 md:space-x-2">
        <button
          onClick={() => setActiveTab("workbench")}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors duration-150 border ${
            activeTab === "workbench"
              ? "bg-accent-500 text-ink-50 border-accent-500"
              : "text-ink-400 hover:text-ink-50 border-transparent hover:border-ink-600"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Try-On Workbench</span>
        </button>

        <button
          onClick={() => setActiveTab("admin")}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium transition-colors duration-150 border ${
            activeTab === "admin"
              ? "bg-accent-500 text-ink-50 border-accent-500"
              : "text-ink-400 hover:text-ink-50 border-transparent hover:border-ink-600"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Admin Catalog</span>
        </button>
      </nav>
    </header>
  );
}
