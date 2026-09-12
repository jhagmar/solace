import { useEffect } from "react";
import { useVisibilityStore } from "@/features/runtime/visibilityStore";

/**
 * Wires the visibility store to the Page Visibility API.
 * Mount once at the app root.
 */
export function usePageVisibility() {
  const setVisibilityState = useVisibilityStore((state) => state.setVisibilityState);

  useEffect(() => {
    const updateVisibilityState = () => {
      setVisibilityState({
        status: document.visibilityState === "visible" ? "visible" : "hidden",
      });
    };

    // Sync immediately on mount, then track changes
    updateVisibilityState();
    document.addEventListener("visibilitychange", updateVisibilityState);

    return () => {
      document.removeEventListener("visibilitychange", updateVisibilityState);
    };
  }, [setVisibilityState]);
}
