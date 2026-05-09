"use client";

import { useEffect } from "react";

/**
 * Mount once on the /import page. Browsers default-navigate to a dropped
 * file when the drop event isn't prevented by *every* element it bubbles
 * to. The dropzone components stop their own events but a stray drop
 * outside the dashed area (or before they mount) opens the file in a new
 * tab. This window-level handler suppresses that across the page.
 */
export function GlobalDropGuard() {
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
  return null;
}
