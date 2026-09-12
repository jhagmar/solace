import { useRef, useState } from "react";
import { exposure } from "@/app/compose/exposure";
import { sunscreen } from "@/app/compose/sunscreen";
import { nearestLaneHandle } from "@/features/chart/laneHit";
import {
  type ChartData,
  chartHourTickOffset,
  chartTime,
  chartX,
  isLoadOffChart,
  type LoadSegment,
  type LoadTone,
  toneForLoad,
} from "@/features/chart/viewModel";
import type { OutdoorWindow } from "@/features/exposure";
import { type MsSinceEpoch, type TimeZone } from "@/shared/domain";
import { formatInstant, snapToMinutes } from "@/shared/time";
import { cn } from "@/shared/ui/cn";
import { messages } from "@/shared/ui/messages";

/**
 * Today's UV and erythemal-load chart, plus an exposure lane.
 *
 * The time axis is always the location-local day (wall-clock 0–24). UV
 * index is the quiet grey series (axis ticks on the left). Load is the
 * colored series: green / amber / red for safe / moderate / dangerous,
 * solid before now and dashed after. Indoor stretches use a quieter fill.
 * The load axis is fixed at 0–3 MED; values above that clip to the roof
 * with hatch and chevrons so a plateau cannot be read as "went inside."
 * SED is never labelled. UV and load arrive independently: a missing
 * series is omitted; busy status lives in the captions above the plot.
 *
 * The lane under the plot is the editable schedule: blocks are outdoor
 * pairs with always-visible drag handles; circles above the lane are
 * sunscreen stamps (filled apply, hollow wash-off; both use a solid stem).
 * Drag a handle to watch load move; a time label follows every handle,
 * including sunscreen stamps. Drag a circle to move that stamp. The lane
 * does not add pairs on tap.
 */

const WIDTH = 360;
const HEIGHT = 226;
const PAD_LEFT = 18;
const PAD_RIGHT = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 56;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const LANE_Y = PAD_TOP + PLOT_H + 8;
const LANE_H = 18;
const HANDLE_W = 6;

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];
const CLIP_HATCH_ID = "solace-load-clip-hatch";
const CLIP_CHEVRON_STEP = 11;
const CLIP_CHEVRON_SIZE = 3.2;

const TONE_CLASSES: Record<LoadTone, string> = {
  safe: "text-load-safe",
  moderate: "text-load-moderate",
  danger: "text-load-danger",
};

function fillOpacity(future: boolean, indoors: boolean, clipped: boolean): number {
  if (clipped) {
    return future ? 0.1 : 0.2;
  }
  const base = future ? 0.07 : 0.16;
  return indoors ? base * 0.45 : base;
}

function uvGridValues(uvMax: number): number[] {
  const ticks: number[] = [];
  for (let v = 2; v <= uvMax + 1e-9; v += 2) {
    ticks.push(v);
  }
  return ticks;
}

function toStrokePath(points: { x: number; y: number }[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

function toAreaPath(points: { x: number; y: number }[], baseline: number): string {
  const [first, last] = [points[0], points[points.length - 1]];
  return `${toStrokePath(points)} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`;
}

function clipChevronXs(x0: number, x1: number): number[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const span = right - left;
  if (span < 2) {
    return [(left + right) / 2];
  }
  const count = Math.max(1, Math.floor(span / CLIP_CHEVRON_STEP));
  const xs: number[] = [];
  for (let i = 0; i < count; i += 1) {
    xs.push(left + ((i + 0.5) / count) * span);
  }
  return xs;
}

function chevronPath(x: number, roofY: number): string {
  const size = CLIP_CHEVRON_SIZE;
  const tip = roofY - size * 1.15;
  const base = roofY - 0.4;
  return `M${(x - size).toFixed(1)},${base.toFixed(1)} L${x.toFixed(1)},${tip.toFixed(1)} L${(x + size).toFixed(1)},${base.toFixed(1)}`;
}

function nowCaretPath(cx: number, roofY: number): string {
  const tip = roofY - 9;
  const base = roofY - 3.5;
  return `M${cx.toFixed(1)},${tip.toFixed(1)} L${(cx - 4).toFixed(1)},${base.toFixed(1)} L${(cx + 4).toFixed(1)},${base.toFixed(1)} Z`;
}

function LoadSegmentPaths({
  segment,
  points,
  baseline,
}: {
  segment: LoadSegment;
  points: { x: number; y: number }[];
  baseline: number;
}) {
  const area = toAreaPath(points, baseline);
  return (
    <g className={cn("pointer-events-none", TONE_CLASSES[segment.tone])}>
      <path
        d={area}
        fill="currentColor"
        fillOpacity={fillOpacity(segment.future, segment.indoors, segment.clipped)}
        stroke="none"
      />
      {segment.clipped && (
        <path d={area} fill={`url(#${CLIP_HATCH_ID})`} fillOpacity={segment.future ? 0.45 : 0.75} />
      )}
      <path
        d={toStrokePath(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={segment.future ? "6 5" : undefined}
      />
      {segment.clipped &&
        clipChevronXs(points[0].x, points[points.length - 1].x).map((x) => (
          <path
            key={x}
            d={chevronPath(x, PAD_TOP)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
    </g>
  );
}

function snapDrag(at: MsSinceEpoch): MsSinceEpoch {
  return snapToMinutes(at, 10);
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * WIDTH,
    y: ((clientY - rect.top) / rect.height) * HEIGHT,
  };
}

function clientToPlotX(svg: SVGSVGElement, clientX: number): number {
  return clientToSvg(svg, clientX, 0).x - PAD_LEFT;
}

function HandleTimeLabel({ x, y, label }: { x: number; y: number; label: string }) {
  const left = Math.min(92, Math.max(8, (x / WIDTH) * 100));
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-1.5 py-0.5 text-[11px] leading-none text-popover-foreground shadow-sm"
      data-chart-drag-time=""
      aria-hidden
      style={{ left: `${left}%`, top: `${(y / HEIGHT) * 100}%`, marginTop: -6 }}
    >
      {label}
    </div>
  );
}

export interface ChartSunscreenTick {
  id: string;
  at: MsSinceEpoch;
  kind: "applied" | "removed";
}

type ChartDrag = { kind: "edge"; id: string; edge: "start" | "end" } | { kind: "tick"; id: string };

export function UvChart({
  data,
  nowMs,
  showLoad = true,
  windows = [],
  sunscreenTicks = [],
  timeZone,
}: {
  data: ChartData;
  nowMs: number;
  showLoad?: boolean;
  windows?: readonly OutdoorWindow[];
  sunscreenTicks?: readonly ChartSunscreenTick[];
  timeZone: TimeZone;
}) {
  const { uv, segments, cautionSed, dangerSed, domain, uvMax, loadMax } = data;
  const nowOffChart = isLoadOffChart(data.loadNow, loadMax);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<ChartDrag | null>(null);
  const [activeDrag, setActiveDrag] = useState<ChartDrag | null>(null);
  const [dragAt, setDragAt] = useState<MsSinceEpoch | null>(null);

  const toX = (time: number) => PAD_LEFT + chartX(data, time, PLOT_W);
  const toYUv = (v: number) => PAD_TOP + PLOT_H - (v / uvMax) * PLOT_H;
  const toYLoad = (load: number) => PAD_TOP + PLOT_H - (Math.min(load, loadMax) / loadMax) * PLOT_H;
  const baseline = PAD_TOP + PLOT_H;

  const uvPoints = uv.map((p) => ({ x: toX(p.time), y: toYUv(p.uvIndex) }));

  const showNowLine = nowMs >= domain.start && nowMs <= domain.end;
  const nowTone = toneForLoad(data.loadNow, cautionSed, dangerSed);
  const nowY = showLoad ? toYLoad(data.loadNow) : toYUv(data.uvNow);
  const nowX = toX(nowMs);

  const handles = windows.flatMap((window) => [
    { id: window.id, edge: "start" as const, x: toX(window.start) },
    { id: window.id, edge: "end" as const, x: toX(window.end) },
  ]);

  const timeAtClientX = (clientX: number): MsSinceEpoch | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    return snapDrag(chartTime(data, clientToPlotX(svg, clientX), PLOT_W));
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    const at = timeAtClientX(event.clientX);
    if (at === null) {
      return;
    }
    setDragAt(at);
    if (current.kind === "tick") {
      sunscreen.moveStamp(current.id, at);
      return;
    }
    const window = windows.find((entry) => entry.id === current.id);
    if (!window) {
      return;
    }
    if (current.edge === "start") {
      exposure.updateWindow(current.id, at, window.end);
    } else {
      exposure.updateWindow(current.id, window.start, at);
    }
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
    setActiveDrag(null);
    setDragAt(null);
  };

  const dragX = dragAt !== null ? toX(dragAt) : null;

  return (
    <div>
      <div className="relative overflow-visible">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={cn(
            "h-auto w-full touch-none select-none outline-none",
            activeDrag?.kind === "edge"
              ? "cursor-ew-resize"
              : activeDrag?.kind === "tick"
                ? "cursor-grabbing"
                : "cursor-default",
          )}
          role="img"
          aria-busy={!showLoad}
          aria-label={messages.todayUv.chart}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <defs>
            <pattern
              id={CLIP_HATCH_ID}
              width={7}
              height={7}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={7} className="stroke-load-danger" strokeWidth={1.5} />
            </pattern>
          </defs>

          {uvGridValues(uvMax).map((v) => (
            <g key={v}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={toYUv(v)}
                y2={toYUv(v)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={2}
                y={toYUv(v) + 3}
                className="pointer-events-none fill-muted-foreground text-[8px]"
              >
                {v}
              </text>
            </g>
          ))}

          {HOUR_TICKS.map((h) => (
            <text
              key={h}
              x={PAD_LEFT + chartHourTickOffset(h, PLOT_W)}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="pointer-events-none fill-muted-foreground text-[9px]"
            >
              {h}
            </text>
          ))}

          <path
            d={toAreaPath(uvPoints, baseline)}
            className="pointer-events-none fill-muted-foreground"
            fillOpacity={0.06}
          />
          <path
            d={toStrokePath(uvPoints)}
            fill="none"
            className="pointer-events-none stroke-muted-foreground/60"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {showLoad &&
            segments.map((seg, i) => (
              <LoadSegmentPaths
                key={i}
                segment={seg}
                points={seg.points.map((p) => ({ x: toX(p.time), y: toYLoad(p.load) }))}
                baseline={baseline}
              />
            ))}

          {showNowLine && (
            <g className="pointer-events-none">
              <line
                x1={nowX}
                x2={nowX}
                y1={PAD_TOP - 4}
                y2={LANE_Y + LANE_H}
                className="stroke-foreground/40"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              {showLoad && nowOffChart && (
                <path
                  d={nowCaretPath(nowX, PAD_TOP)}
                  className={TONE_CLASSES[nowTone]}
                  fill="currentColor"
                />
              )}
              <circle
                cx={nowX}
                cy={nowY}
                r={4}
                className={cn(
                  showLoad ? TONE_CLASSES[nowTone] : "text-muted-foreground",
                  "stroke-background",
                )}
                fill="currentColor"
                strokeWidth={2}
              />
            </g>
          )}

          <rect
            x={PAD_LEFT}
            y={LANE_Y}
            width={PLOT_W}
            height={LANE_H}
            rx={3}
            className="fill-muted/80"
            role="presentation"
          />

          {windows.map((window) => {
            const x = toX(window.start);
            const width = Math.max(toX(window.end) - x, 2);
            return (
              <g key={window.id} className="pointer-events-none">
                <rect
                  x={x}
                  y={LANE_Y}
                  width={width}
                  height={LANE_H}
                  rx={3}
                  className="fill-primary/55"
                />
                <rect
                  x={x - HANDLE_W / 2}
                  y={LANE_Y - 2}
                  width={HANDLE_W}
                  height={LANE_H + 4}
                  rx={1}
                  className="fill-background stroke-primary"
                  strokeWidth={1}
                />
                <rect
                  x={x + width - HANDLE_W / 2}
                  y={LANE_Y - 2}
                  width={HANDLE_W}
                  height={LANE_H + 4}
                  rx={1}
                  className="fill-background stroke-primary"
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {handles.map((handle) => (
            <rect
              key={`${handle.id}-${handle.edge}`}
              x={handle.x - LANE_H}
              y={LANE_Y - LANE_H}
              width={LANE_H * 2}
              height={LANE_H * 3}
              className="cursor-ew-resize fill-transparent"
              role="button"
              aria-label={
                handle.edge === "start"
                  ? messages.todayUv.goingOutside
                  : messages.todayUv.comingInside
              }
              onPointerDown={(event) => {
                const svg = svgRef.current;
                if (!svg) {
                  return;
                }
                const point = clientToSvg(svg, event.clientX, event.clientY);
                const hit = nearestLaneHandle(point.x, point.y, handles, LANE_Y, LANE_H);
                if (!hit) {
                  return;
                }
                event.stopPropagation();
                svg.setPointerCapture(event.pointerId);
                const next: ChartDrag = { kind: "edge", id: hit.id, edge: hit.edge };
                drag.current = next;
                setActiveDrag(next);
                const window = windows.find((entry) => entry.id === hit.id);
                if (window) {
                  setDragAt(window[hit.edge]);
                }
              }}
            />
          ))}

          {sunscreenTicks.map((tick) => {
            const x = toX(tick.at);
            const washed = tick.kind === "removed";
            return (
              <g key={tick.id}>
                <rect
                  x={x - 6}
                  y={LANE_Y - 8}
                  width={12}
                  height={LANE_H + 16}
                  className={cn(
                    activeDrag?.kind === "tick" && activeDrag.id === tick.id
                      ? "cursor-grabbing"
                      : "cursor-grab",
                    "fill-transparent outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent]",
                  )}
                  role="button"
                  tabIndex={-1}
                  aria-label={
                    washed ? messages.todayUv.stampWashedOff : messages.todayUv.stampApplied
                  }
                  style={{ outline: "none" }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.blur();
                    event.currentTarget.closest("svg")?.setPointerCapture(event.pointerId);
                    drag.current = { kind: "tick", id: tick.id };
                    setActiveDrag({ kind: "tick", id: tick.id });
                    setDragAt(tick.at);
                  }}
                />
                <line
                  x1={x}
                  x2={x}
                  y1={LANE_Y - 2}
                  y2={LANE_Y + LANE_H + 2}
                  className="pointer-events-none stroke-foreground/70"
                  strokeWidth={1.5}
                />
                <circle
                  cx={x}
                  cy={LANE_Y - 2}
                  r={2.5}
                  className={
                    washed
                      ? "pointer-events-none fill-background stroke-foreground/70"
                      : "pointer-events-none fill-foreground/70"
                  }
                  strokeWidth={washed ? 1.25 : 0}
                />
              </g>
            );
          })}
        </svg>
        {dragX !== null && dragAt !== null && (
          <HandleTimeLabel x={dragX} y={LANE_Y - 2} label={formatInstant(timeZone, dragAt)} />
        )}
      </div>

      <div className="mt-1 flex items-center gap-x-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-muted-foreground/60" />
          {messages.todayUv.legendUv}
        </span>
        <span className="flex items-center gap-1.5">
          {(["safe", "moderate", "danger"] as const).map((tone) => (
            <span key={tone} className={cn("h-0.5 w-4 rounded bg-current", TONE_CLASSES[tone])} />
          ))}
          {messages.todayUv.legendLoad}
        </span>
      </div>
    </div>
  );
}
