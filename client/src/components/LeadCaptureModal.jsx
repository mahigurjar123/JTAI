import React, { useState } from "react";
import { X, Download } from "lucide-react";

// View: pure presentation. Stays open in-place over the current page (no
// navigation/redirect) — submitting just closes the modal and lets the
// caller's pending download proceed, landing the user right back where they were.
export default function LeadCaptureModal({ isOpen, errors, onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ name, email, phone });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/90 p-4">
      <div className="surface-raised w-full max-w-sm p-6 space-y-5 relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-ink-500 hover:text-ink-50 transition-colors"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold text-ink-50">Before you download</h3>
          <p className="text-xs text-ink-400">
            Enter your details once — you won't be asked again on this device.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-ink-400 font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-ink-950 border border-ink-700 px-4 py-2.5 text-ink-50 focus:outline-none focus:border-accent-500 transition-colors"
            />
            {errors.name && <p className="text-accent-400 text-[10px]">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-ink-400 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-ink-950 border border-ink-700 px-4 py-2.5 text-ink-50 focus:outline-none focus:border-accent-500 transition-colors"
            />
            {errors.email && <p className="text-accent-400 text-[10px]">{errors.email}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-ink-400 font-medium">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full bg-ink-950 border border-ink-700 px-4 py-2.5 text-ink-50 focus:outline-none focus:border-accent-500 transition-colors"
            />
            {errors.phone && <p className="text-accent-400 text-[10px]">{errors.phone}</p>}
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center space-x-2 py-3 font-bold tracking-wide bg-accent-500 border border-accent-500 text-ink-50 hover:bg-accent-600 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Continue to Download</span>
          </button>
        </form>
      </div>
    </div>
  );
}
