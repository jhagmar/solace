/**
 * Composition root barrel. Prefer the per-feature modules so a header
 * control does not pull forecast parsing or the ODE solver onto first paint.
 * Importing a compose module constructs that controller; it starts no timers
 * or requests.
 */

export { clock, timeoutFactory } from "./clock";
export { exposure } from "./exposure";
export { forecast } from "./forecast";
export { locationSearch } from "./location";
export { simulation } from "./simulation";
export { skinTone } from "./skin-tone";
export { sunscreen } from "./sunscreen";
export { theme } from "./theme";
