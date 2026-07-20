import React from "react";
import { Check, X, RotateCw, Image, Eye, Sun, Scaling } from "lucide-react";

export default function ValidationStatus({ label, steps, validating }) {
  const getIcon = (status) => {
    switch (status) {
      case "success":
        return <Check className="w-4 h-4 text-ink-50" />;
      case "error":
        return <X className="w-4 h-4 text-accent-400" />;
      case "pending":
      default:
        return <RotateCw className="w-4 h-4 text-ink-500 animate-spin" />;
    }
  };

  const getStepClass = (status) => {
    switch (status) {
      case "success":
        return "border-ink-50 bg-ink-800 text-ink-50";
      case "error":
        return "border-accent-500 bg-accent-500/10 text-accent-300";
      case "pending":
      default:
        return "border-ink-700 bg-ink-900 text-ink-400";
    }
  };

  const categories = [
    { key: "resolution", label: "Min Resolution", icon: Scaling },
    { key: "lighting", label: "Exposure & Lighting", icon: Sun },
    { key: "face", label: "Face Presence", icon: Image },
    { key: "symmetry", label: "Frontal Alignment", icon: Eye }
  ];

  return (
    <div className="surface w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold tracking-wide text-ink-200 uppercase">
          {label} Analysis
        </h4>
        {validating ? (
          <span className="text-xs text-accent-400 flex items-center space-x-1">
            <RotateCw className="w-3 h-3 animate-spin" />
            <span>Scanning...</span>
          </span>
        ) : (
          <span className="text-xs text-ink-500 font-medium">Ready</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {categories.map((cat) => {
          const stepStatus = steps[cat.key]; // success, error, pending
          const Icon = cat.icon;
          return (
            <div
              key={cat.key}
              className={`flex items-center space-x-3 p-3 border text-xs transition-colors duration-200 ${getStepClass(
                stepStatus
              )}`}
            >
              <div className="flex-shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{cat.label}</p>
                <p className="text-[10px] opacity-70 mt-0.5 truncate">
                  {stepStatus === "success" ? "Passed" : stepStatus === "error" ? "Failed" : "Waiting"}
                </p>
              </div>
              <div className="flex-shrink-0">{getIcon(stepStatus)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
