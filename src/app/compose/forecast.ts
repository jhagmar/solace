import { ForecastStateMachine } from "@/features/forecast/machine";
import { forecastStateStore } from "@/features/forecast/store";
import { getEffectiveLocation } from "@/features/location/activeStore";
import { isNetworkOnline } from "@/features/runtime/networkStore";
import { isPageVisible } from "@/features/runtime/visibilityStore";
import { clock, timeoutFactory, uvForecastRequestFactory } from "./platform";

export const forecast = new ForecastStateMachine(
  uvForecastRequestFactory,
  timeoutFactory,
  forecastStateStore,
  getEffectiveLocation,
  isNetworkOnline,
  isPageVisible,
  clock,
);
