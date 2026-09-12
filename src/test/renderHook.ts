import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/** Mounts a hook in jsdom without pulling in Testing Library. */
export function renderHook<T>(useHook: () => T): {
  result: { current: T };
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const result = { current: undefined as T };
  function Probe(): ReactNode {
    result.current = useHook();
    return null;
  }
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe));
  });
  return {
    result,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
