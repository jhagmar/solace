import { useEffect } from "react";
import { useNetworkStore } from "@/features/runtime/networkStore";

/**
 * Wires the network store to the browser's online/offline events.
 * Mount once at the app root.
 */
export function useNetworkStatus() {
  const setNetworkState = useNetworkStore((state) => state.setNetworkState);

  useEffect(() => {
    const updateNetworkState = () => {
      setNetworkState({ status: navigator.onLine ? "online" : "offline" });
    };

    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    updateNetworkState();

    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, [setNetworkState]);
}
