import { History, LoaderCircle, MapPin, WifiOff, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useRecentLocationsStore } from "@/features/location/recentsStore";
import { isTypedLocationQuery } from "@/features/location/searchInput";
import { useLocationSearch } from "@/features/location/sync";
import { useEffectiveLocation } from "@/features/location/useEffectiveLocation";
import { useNetworkStore } from "@/features/runtime";
import {
  createLocationDisplayString,
  filterLocationsByDisplayString,
  type Location,
} from "@/shared/domain";
import { cn } from "@/shared/ui/cn";
import { formatMessage, messages } from "@/shared/ui/messages";
import {
  ComboboxClear,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxRoot,
} from "@/shared/ui/primitives/combobox";

/**
 * LocationSearch component.
 * A combobox bridging the location search state machine with the UI.
 * The visible input text is local view state; the machine owns the search lifecycle.
 * Has absolutely zero network or timer logic inside of it.
 */
export const LocationSearch: React.FC = () => {
  const { state, search, cancel, select, unset } = useLocationSearch();
  const recents = useRecentLocationsStore((s) => s.recentLocations.recents);
  const isOnline = useNetworkStore((s) => s.networkState.status === "online");
  const effectiveLocation = useEffectiveLocation();

  const selectedDisplayString = effectiveLocation
    ? createLocationDisplayString(effectiveLocation)
    : "";

  // The display string a cancellation reverts to: the pre-search fallback while
  // searching, otherwise the currently set location (or empty).
  const fallbackDisplayString =
    state.status === "searching" && state.fallback.status === "set"
      ? createLocationDisplayString(state.fallback.location)
      : selectedDisplayString;

  const [text, setText] = useState(selectedDisplayString);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);

  // Unfocused, the input mirrors the selected location (or falls back to the placeholder).
  useEffect(() => {
    if (!focused) {
      setText(selectedDisplayString);
    }
  }, [selectedDisplayString, focused]);

  // While the input still holds the untouched selection display string, the box
  // acts as a "browse history" menu: show all recents, unfiltered.
  const isBrowsing = text === selectedDisplayString;
  const effectiveQuery = isBrowsing ? "" : text;

  // Merged dropdown items: matching recents first, then remote results,
  // deduplicated by location id.
  const { items, recentIds } = useMemo(() => {
    const recentMatches = filterLocationsByDisplayString(recents, effectiveQuery);
    const remoteResults =
      state.status === "searching" && state.remoteSearchState.status === "success"
        ? state.remoteSearchState.results.filter((r) => !recentMatches.some((m) => m.id === r.id))
        : [];
    return {
      items: [...recentMatches, ...remoteResults],
      recentIds: new Set(recentMatches.map((m) => String(m.id))),
    };
  }, [recents, effectiveQuery, state]);

  const remoteStatus = state.status === "searching" ? state.remoteSearchState.status : null;
  const showLoadingRow = remoteStatus === "debouncing" || remoteStatus === "fetching";
  const showOfflineRow =
    remoteStatus === "offline" || (!isOnline && remoteStatus === "paused" && text !== "");
  const showMinLengthHint = isOnline && remoteStatus === "paused" && text.trim().length > 0;

  const handleInputChange = (value: string, details: { reason?: string }) => {
    // Selection, clear, blur, and programmatic fills must not start a search.
    // Only genuine typing/paste should; otherwise the store goes `searching`
    // with the previous fallback and the chart waits for a blur to commit.
    if (!isTypedLocationQuery(details.reason)) {
      if (details.reason === "input-clear" || details.reason === "clear-press") {
        setText(value);
      }
      return;
    }
    setText(value);
    search(value);
  };

  const handleSelect = (location: Location | null) => {
    if (!location) {
      return;
    }
    select(location);
    setText(createLocationDisplayString(location));
  };

  // Escape: cancel the in-progress search, reverting to the fallback
  const handleCancel = () => {
    cancel();
    setText(fallbackDisplayString);
  };

  // The X button: clear the location entirely (unlike Escape, which only
  // cancels an in-progress search)
  const handleClear = () => {
    unset();
    setText("");
  };

  // Blurring commits what's in the field: empty text means "no location",
  // while a partial query is not a location, so the search is cancelled and
  // the input reverts to the still-set fallback location. Either way the
  // input and the location state are consistent afterwards.
  const handleBlur = () => {
    setFocused(false);
    if (text.trim() === "") {
      unset();
    } else {
      handleCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleCancel();
    }
    // Enter on an empty field confirms "no location", like blurring
    if (e.key === "Enter" && text.trim() === "") {
      unset();
    }
  };

  return (
    <div className="w-full">
      <ComboboxRoot<Location>
        items={items}
        value={effectiveLocation}
        inputValue={text}
        onInputValueChange={handleInputChange}
        onValueChange={handleSelect}
        isItemEqualToValue={(item, value) => item.id === value.id}
        itemToStringLabel={(location) => createLocationDisplayString(location)}
        itemToStringValue={(location) => String(location.id)}
        filter={null}
        open={open}
        onOpenChange={setOpen}
      >
        <ComboboxInputGroup className="h-11 rounded-xl border-border bg-card shadow-sm">
          <MapPin
            className={cn(
              "ml-3 size-4 shrink-0",
              effectiveLocation ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden
          />
          <ComboboxInput
            aria-label={messages.location.label}
            placeholder={messages.location.placeholder}
            className="pl-2"
            onMouseDown={(e) => {
              // Gaining focus by mouse: suppress the browser's native caret
              // placement (which would override select-all) and do both manually.
              if (!focused) {
                e.preventDefault();
                e.currentTarget.focus();
                e.currentTarget.select();
              }
            }}
            onFocus={(e) => {
              setFocused(true);
              setOpen(true);
              // Covers keyboard focus; mouse focus is handled in onMouseDown.
              // Selects the whole display string so a single backspace clears it.
              e.currentTarget.select();
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          {focused && text.length > 0 && (
            <ComboboxClear onClick={handleClear} aria-label={messages.location.clear}>
              <X />
            </ComboboxClear>
          )}
        </ComboboxInputGroup>

        <ComboboxPortal>
          <ComboboxPositioner>
            <ComboboxPopup>
              {showOfflineRow && (
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                  <WifiOff className="size-4" />
                  {messages.location.offlineRecents}
                </div>
              )}
              {showMinLengthHint && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  {messages.location.minLength}
                </div>
              )}
              {showLoadingRow && (
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {messages.location.searching}
                </div>
              )}
              {state.status === "searching" && state.remoteSearchState.status === "failure" && (
                <div className="px-2 py-1.5 text-sm text-destructive">
                  {formatMessage(messages.location.searchFailed, {
                    reason: state.remoteSearchState.reason,
                  })}
                </div>
              )}

              <ComboboxList>
                {(location: Location) => (
                  <ComboboxItem key={String(location.id)} value={location}>
                    {recentIds.has(String(location.id)) ? (
                      <History className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <MapPin className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    {createLocationDisplayString(location)}
                  </ComboboxItem>
                )}
              </ComboboxList>

              {!showLoadingRow && (
                <ComboboxEmpty>
                  {effectiveQuery.trim().length === 0
                    ? messages.location.noRecents
                    : messages.location.noneFound}
                </ComboboxEmpty>
              )}
            </ComboboxPopup>
          </ComboboxPositioner>
        </ComboboxPortal>
      </ComboboxRoot>
    </div>
  );
};
