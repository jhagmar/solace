import "../index.css";

// Zod 4 probes `new Function()` to decide whether to JIT-compile schemas.
// That is an eval CSP violation (`script-src 'self'`). Disable it first.
const zodConfig = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
zodConfig.__zod_globalConfig = { ...zodConfig.__zod_globalConfig, jitless: true };

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

/** Yield so each dynamic import and the first render are separate tasks (TBT). */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

void (async () => {
  await import("react");
  await yieldToMain();
  await import("react-dom/client");
  await yieldToMain();
  const { mount } = await import("./mount");
  await yieldToMain();
  mount(root);
})();
