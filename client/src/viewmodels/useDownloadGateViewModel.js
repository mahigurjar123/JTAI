// ViewModel: gates a "download" action behind a one-time lead-capture form.
// Any component can call `requestDownload(fn)` — if the visitor's details are
// already saved, `fn` runs immediately; otherwise the form modal opens and
// `fn` runs only after a valid submission. The View (modal) only reads
// `isFormOpen`/`errors` and calls `submit`/`cancel` — it never touches storage.

import { useState, useCallback, useRef } from "react";
import { LeadInfo } from "../models/LeadInfo";
import { getSavedLead, saveLead } from "../services/leadCaptureStore";

export function useDownloadGateViewModel() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const pendingActionRef = useRef(null);

  const requestDownload = useCallback((action) => {
    const savedLead = getSavedLead();
    if (savedLead) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setErrors({});
    setIsFormOpen(true);
  }, []);

  const submit = useCallback(({ name, email, phone }) => {
    const lead = new LeadInfo({ name, email, phone });
    const validationErrors = lead.validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    saveLead(lead);
    setIsFormOpen(false);
    setErrors({});

    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, []);

  const cancel = useCallback(() => {
    pendingActionRef.current = null;
    setIsFormOpen(false);
    setErrors({});
  }, []);

  return { isFormOpen, errors, requestDownload, submit, cancel };
}
