/** Current network connectivity. */
export type NetworkState = { status: "online" } | { status: "offline" };

/**
 * Whether the page is on-screen (mirrors the Page Visibility API's
 * `document.visibilityState`).
 */
export type VisibilityState = { status: "visible" } | { status: "hidden" };
