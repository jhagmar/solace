/**
 * Base UI combobox `onInputValueChange` reasons that mean the user typed
 * (or pasted) a query. Selection, clear, blur, and programmatic updates
 * must not start a location search — that would put the store in
 * `searching` with the previous fallback and leave the chart waiting on
 * a blur to commit.
 */
export function isTypedLocationQuery(reason: string | undefined): boolean {
  return reason === "input-change" || reason === "input-paste";
}
