/**
 * The main (and only) app screen: a single mobile-first column of
 * interaction stops — location search, today's UV chart with an exposure
 * lane, then the simulation parameters (skin tone, sunscreen, outdoor
 * pairs). Until a location exists, Today's UV, Sunscreen, and Exposure
 * are dashed placeholders; skin tone stays. UV and load fill in
 * independently: busy status is a caption-line spinner (Index · updating,
 * Burn risk · simulating), never an in-plot overlay or a full-card
 * placeholder.
 */

import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { clock, timeoutFactory } from "@/app/compose/clock";
import { GlobalError } from "@/app/GlobalError";
import { ClearDayControl } from "@/features/chart/ClearDayControl";
import { blendTrajectories, prefersReducedMotion, RETARGET_MS } from "@/features/chart/retarget";
import {
  burnRiskLevelForLoad,
  createDayChartData,
  forecastForChart,
  isUvForecastPending,
  nextBurnRiskTransition,
} from "@/features/chart/viewModel";
import { useExposureStore, windowsOnLocalDay } from "@/features/exposure";
import { useForecastStore } from "@/features/forecast/store";
import { LocationSearch } from "@/features/location/ui/LocationSearch";
import { useEffectiveLocation } from "@/features/location/useEffectiveLocation";
import {
  isSimulationOutputCurrent,
  type SimulationState,
  useSimulationStore,
} from "@/features/simulation";
import { useSkinToneStore } from "@/features/skin-tone/store";
import { SkinToneSlider } from "@/features/skin-tone/ui/SkinToneSlider";
import { useSunscreenStore } from "@/features/sunscreen";
import { createMilliseconds } from "@/shared/domain";
import {
  deviceTimeZone,
  firstSecondOfLocalDay,
  formatInstant,
  nextFirstSecondOfLocalDay,
} from "@/shared/time";
import { ControlCard } from "@/shared/ui/control-card";
import { LockedDayCard } from "@/shared/ui/locked-day-card";
import { formatMessage, messages } from "@/shared/ui/messages";

const UvChart = lazy(() =>
  import("@/features/chart/UvChart").then((module) => ({ default: module.UvChart })),
);
const SunscreenControl = lazy(() =>
  import("@/features/sunscreen/ui/SunscreenControl").then((module) => ({
    default: module.SunscreenControl,
  })),
);
const ExposureControl = lazy(() =>
  import("@/features/exposure/ui/ExposureControl").then((module) => ({
    default: module.ExposureControl,
  })),
);

export const Route = createFileRoute("/")({
  component: Index,
  errorComponent: GlobalError,
});

function CaptionBusy({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <LoaderCircle className="size-3 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

const EMPTY_TRAJECTORY: SimulationState[] = [];

function useRetargetedTrajectory(trajectory: readonly SimulationState[]): SimulationState[] {
  const [displayed, setDisplayed] = useState<SimulationState[]>(() => [...trajectory]);
  const fromRef = useRef<SimulationState[]>([...trajectory]);

  useEffect(() => {
    const to = [...trajectory];
    if (prefersReducedMotion()) {
      fromRef.current = to;
      setDisplayed(to);
      return;
    }
    const from = fromRef.current;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / RETARGET_MS);
      const next = blendTrajectories(from, to, t);
      fromRef.current = next;
      setDisplayed(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [trajectory]);

  return displayed;
}

function Index() {
  const location = useEffectiveLocation();

  const skinTone = useSkinToneStore((s) => s.skinTone);
  const forecastState = useForecastStore((s) => s.forecastState);
  const simulationOutput = useSimulationStore((s) => s.simulationOutput);
  const simulationEvents = useSimulationStore((s) => s.simulationInput.events);
  const windows = useExposureStore((s) => s.exposureState.windows ?? []);
  const applications = useSunscreenStore((s) => s.sunscreenState.applications ?? []);
  const removals = useSunscreenStore((s) => s.sunscreenState.removals ?? []);
  const [scheduleUpdating, setScheduleUpdating] = useState(false);

  const forecast = location ? forecastForChart(forecastState, location.id) : null;
  const timeZone = location?.timezone ?? deviceTimeZone();

  const [nowMs, setNowMs] = useState(() => Number(clock()));

  const scheduleEpoch = useRef(0);

  useEffect(() => {
    let current = timeoutFactory.create(function tick() {
      setNowMs(Number(clock()));
      current = timeoutFactory.create(tick, createMilliseconds(30_000));
    }, createMilliseconds(30_000));
    return () => current.cancel();
  }, []);

  const readyTrajectory =
    simulationOutput.status === "ready" ? simulationOutput.trajectory : EMPTY_TRAJECTORY;
  const displayedTrajectory = useRetargetedTrajectory(readyTrajectory);

  useEffect(() => {
    const epoch = ++scheduleEpoch.current;
    setScheduleUpdating(false);
    const timeout = timeoutFactory.create(() => {
      if (epoch === scheduleEpoch.current) {
        setScheduleUpdating(true);
      }
    }, createMilliseconds(300));
    return () => timeout.cancel();
  }, [windows, applications, removals]);

  useEffect(() => {
    scheduleEpoch.current += 1;
    setScheduleUpdating(false);
  }, [simulationOutput]);

  const outputIsCurrent = isSimulationOutputCurrent(simulationOutput, nowMs);
  const uvPending = location ? isUvForecastPending(forecastState, location.id) : false;
  const dayStart = firstSecondOfLocalDay(timeZone, nowMs);
  const dayEnd = nextFirstSecondOfLocalDay(timeZone, nowMs);
  const todayWindows = windowsOnLocalDay(windows, timeZone, nowMs);
  const sunscreenTicks = [
    ...applications.map((entry) => ({
      id: entry.id,
      at: entry.settings.appliedAt,
      kind: "applied" as const,
    })),
    ...removals.map((entry) => ({
      id: entry.id,
      at: entry.at,
      kind: "removed" as const,
    })),
  ].filter((tick) => tick.at >= dayStart && tick.at < dayEnd);

  const showLoad = readyTrajectory.length > 0;
  const chartData = useMemo(() => {
    if (!location) {
      return null;
    }
    return createDayChartData({
      nowMs,
      timeZone,
      skinTone,
      forecast,
      trajectory: displayedTrajectory,
      events: simulationEvents,
      dayStart,
    });
  }, [
    location,
    nowMs,
    timeZone,
    skinTone,
    forecast,
    displayedTrajectory,
    simulationEvents,
    dayStart,
  ]);

  const burnRisk = chartData
    ? {
        current: burnRiskLevelForLoad(chartData.loadNow, chartData.cautionSed, chartData.dangerSed),
        next: nextBurnRiskTransition(chartData, nowMs),
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      <LocationSearch />

      {location && chartData ? (
        <ControlCard label={messages.todayUv.label} aside={<ClearDayControl />}>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-muted-foreground">
              {messages.todayUv.index}
              {forecast ? (
                formatMessage(messages.todayUv.indexNowPeak, {
                  now: chartData.uvNow.toFixed(1),
                  peak: chartData.uvPeak.uvIndex.toFixed(1),
                  at: formatInstant(timeZone, chartData.uvPeak.time),
                })
              ) : (
                <>
                  {" · "}
                  {uvPending ? (
                    <CaptionBusy label={messages.todayUv.updating} />
                  ) : (
                    messages.todayUv.noForecast
                  )}
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {messages.todayUv.burnRisk}
              {" · "}
              {showLoad && outputIsCurrent && burnRisk ? (
                <>
                  {burnRisk.current}
                  {burnRisk.next
                    ? ` · ${burnRisk.next.level} by ${formatInstant(timeZone, burnRisk.next.atMs)}`
                    : ""}
                  {scheduleUpdating ? (
                    <>
                      {" · "}
                      <CaptionBusy label={messages.todayUv.updating} />
                    </>
                  ) : null}
                </>
              ) : (
                <CaptionBusy label={messages.todayUv.simulating} />
              )}
            </p>
          </div>
          <Suspense fallback={<div className="h-[226px]" aria-hidden />}>
            <UvChart
              data={chartData}
              nowMs={nowMs}
              showLoad={showLoad}
              windows={todayWindows}
              sunscreenTicks={sunscreenTicks}
              timeZone={timeZone}
            />
          </Suspense>
        </ControlCard>
      ) : (
        <LockedDayCard label={messages.todayUv.label}>{messages.todayUv.locked}</LockedDayCard>
      )}

      <SkinToneSlider />

      {location ? (
        <>
          <Suspense fallback={<div className="min-h-24" aria-hidden />}>
            <SunscreenControl timeZone={timeZone} now={clock} />
          </Suspense>

          <Suspense fallback={<div className="min-h-24" aria-hidden />}>
            <ExposureControl
              timeZone={timeZone}
              now={clock}
              lastLightHourly={forecast?.hourly ?? []}
            />
          </Suspense>
        </>
      ) : (
        <>
          <LockedDayCard label={messages.sunscreen.label}>
            {messages.sunscreen.locked}
          </LockedDayCard>
          <LockedDayCard label={messages.exposure.label}>{messages.exposure.locked}</LockedDayCard>
        </>
      )}
    </div>
  );
}
