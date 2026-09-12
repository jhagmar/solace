/**
 * Default-locale user-visible copy. Domain code stays locale-free.
 * Interpolation uses `{name}` placeholders via {@link formatMessage}.
 */

export const DEFAULT_LOCALE = "en";

export const en = {
  skipToContent: "Skip to content",
  wordmark: "solace",
  install: "Install",
  theme: {
    group: "Theme",
    light: "Light theme",
    dark: "Dark theme",
    auto: "Auto (system) theme",
  },
  location: {
    label: "Location",
    placeholder: "Search for a location",
    clear: "Clear location",
    minLength: "Type at least three letters to search.",
    searching: "Searching",
    offlineRecents: "Offline — showing recent locations",
    searchFailed: "Search failed: {reason}",
    noRecents: "No recent locations.",
    noneFound: "No locations found.",
  },
  todayUv: {
    label: "Today's UV",
    locked: "Choose a location to see today's UV forecast and your burn risk.",
    index: "Index",
    indexNowPeak: " · now {now} · peak {peak} at {at}",
    noForecast: "no forecast for today",
    updating: "updating",
    burnRisk: "Burn risk",
    simulating: "simulating",
    legendUv: "UV index",
    legendLoad: "Burn risk",
    chart:
      "Chart of today's UV index and your burn-risk load, with outdoor windows on a lane below",
    goingOutside: "Going outside",
    comingInside: "Coming inside",
    stampApplied: "Sunscreen applied",
    stampWashedOff: "Sunscreen washed off",
  },
  clearDay: {
    label: "Clear the day",
    title: "Clear the day",
    body: "This removes every outdoor window and sunscreen stamp, and starts burn risk from zero.",
    cancel: "Cancel",
    confirm: "Clear",
  },
  skinTone: {
    label: "Skin tone",
    veryFair: "Very fair",
    fair: "Fair",
    medium: "Medium",
    olive: "Olive",
    brown: "Brown",
    darkBrown: "Dark brown",
  },
  sunscreen: {
    label: "Sunscreen",
    locked: "This is where you will log sunscreen use once a location is chosen.",
    empty: "Tap below to log sunscreen.",
    apply: "Apply",
    washOff: "Wash off",
    clear: "Clear sunscreen",
    sheetTitle: "Sunscreen",
    spf: "Spf",
    customSpf: "Custom Spf, {min} to {max}",
    amount: "Amount",
    amountHelp: "About Amount",
    thinLayer: "Thin layer",
    typicalAmount: "Typical amount",
    recommendedAmount: "Recommended amount",
    thinHint: "Less than one finger-length per arm",
    typicalHint: "Matching one finger-length per arm",
    recommendedHint: "Matching two finger-lengths per arm",
    amountHelpP1:
      "The two-finger rule is a line of sunscreen along the length of two fingers, spread over one arm. That coat is the amount used to measure the Spf on the pack.",
    amountHelpP2:
      "People typically use about half that coat. Half the coat does not give half the labelled Spf. With a typical amount, Spf 30 behaves like 5, and 50 like 7.",
    applied: "Applied",
    washedOff: "Washed off",
    rowApplied: "Spf {spf} · {amount} · {time}",
    rowWashed: "washed off · {time}",
    amountThin: "thin layer",
    amountTypical: "typical amount",
    amountRecommended: "recommended amount",
  },
  exposure: {
    label: "Exposure",
    locked: "This is where you will log going outside.",
    empty: "Tap below to add an outdoor window.",
    oneHour: "1 hour",
    twoHours: "2 hours",
    restOfDay: "Rest of day",
    clear: "Clear outdoor windows",
    sheetTitle: "Outdoor window",
    start: "Start",
    end: "End",
    lastLight: "Last light",
    row: "outside · {start} – {end}",
  },
  time: {
    now: "Now",
    thirtyMinAgo: "30 min ago",
    oneHourAgo: "1 h ago",
    custom: "Custom",
    customTime: "Custom time",
  },
  sheet: {
    done: "Done",
    remove: "Remove",
  },
  pwa: {
    offlineReady: "Solace can open offline.",
    updateReady: "A new version is ready.",
    reload: "Reload",
    dismiss: "Dismiss",
  },
  network: {
    forecastsNeedNetwork: "Forecasts need a network.",
  },
  persist: {
    quota: "Storage is full. Clear site data for this app, then try again.",
    unknown: "This device could not save your day. Try again.",
  },
  error: {
    title: "This screen could not load.",
    tryAgain: "Try again",
    backToToday: "Back to today",
  },
  footer: {
    openMeteo: "UV forecasts and geocoding from Open-Meteo (CC BY 4.0).",
    medical:
      "Solace is not a medical device and does not give medical advice. Burn-risk colours are estimates only. Clothing, shade and sunscreen remain your responsibility.",
    offline: "The app can open offline. Forecasts and location search need a network connection.",
    data: "The app runs in your browser. Location search and forecast requests are sent to Open-Meteo; everything else stays on this device.",
    version: "Version {version}.",
    source: "Source is on GitHub.",
  },
} as const;

export type Messages = typeof en;

export const messages: Messages = en;

export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
