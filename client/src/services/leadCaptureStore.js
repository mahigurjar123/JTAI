// Service: persists captured lead info in localStorage so the download gate
// only ever asks once per browser. No React here — pure storage access that
// the ViewModel calls.

import { LeadInfo } from "../models/LeadInfo";

const STORAGE_KEY = "jtai_lead_info";

export function getSavedLead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lead = new LeadInfo(parsed);
    return lead.isValid() ? lead : null;
  } catch {
    return null;
  }
}

export function saveLead(lead) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    name: lead.name,
    email: lead.email,
    phone: lead.phone
  }));
}
