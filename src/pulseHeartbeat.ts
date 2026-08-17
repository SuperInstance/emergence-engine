// src/pulseHeartbeat.ts
// The Pulse Heartbeat — the engine's agents think in pulses even when idle.
//
// Cross-pollinated from the elephant (elephant/elephant/pulse.py), the
// captain's directive made code:
//
//   "Agents using internal monologues on constant pulses even if they
//    aren't talking. These internal monologues take a Perception check
//    as part of their looking around and thinking."
//
// The macro read: ONE number is nothing; TWO numbers show DIRECTION;
// MORE THAN TWO show RATE OF CHANGE. An agent is always sensing, even
// when silent — the pulse is the heartbeat of that sensing.
//
// Mapped into the engine's drive model:
//   - A starving agent isn't just hungry — it PERCEIVES its environment's
//     movement and its hunger responds to the room.
//   - Stagnation isn't a timer — it's the perception that nothing is
//     moving (rate ≈ 0).
//   - Force-seek isn't a flag — it's a room that reads cold and the
//     agent seeking warmth.
//
// What this module gives the engine:
//   PerceptionCheck  — the macro read: direction (last two readings),
//                      rate of change (last three+), per-dial deltas,
//                      and a scalar warmth read.
//   PulseLoop        — an agent's constant sensing heartbeat: ticks even
//                      when the agent never acts; the internal monologue
//                      runs in the silence.
//   DriveModulator   — perception → drives: cold rooms accelerate hunger
//                      and force warmth-seeking; flat rooms drive
//                      stagnation; warm rooms calm every drive.
//   readingFromDials — the elephant bridge: accept elephant dial
//                      readings (a DialBank.readings() dict, or a
//                      bank-like object) as pulse input.

import type { GroupFlow } from "./types.js";

// ──────────────────────────────────────────────
// The perception-check math
// ──────────────────────────────────────────────

/** Moves below this floor read as 0 — the number doesn't matter. */
export const DEFAULT_NOISE_FLOOR = 0.02;

/** One pulse's dial readings — the elephant's `DialBank.readings()` shape. */
export type PulseReading = Record<string, number>;

export interface PerceptionOptions {
  /** Per-pulse moves below this floor read as 0 (default 0.02). */
  noiseFloor?: number;
  /** Optional timestamps; when given, direction/rate are per second. */
  ts?: readonly number[];
}

interface DialMatrix {
  names: string[];
  values: number[][]; // rows × names, NaN carried forward from the last valid
}

/** Coerce a pulse series into a matrix. NaN/inf readings are carried
 * forward from the last valid reading — a glitch is NOT a movement, and
 * the number doesn't matter — so a single bad sample never fabricates
 * direction or rate. */
function toMatrix(series: readonly PulseReading[]): DialMatrix {
  const names = series.length > 0 ? Object.keys(series[0]) : [];
  const values: number[][] = [];
  const last = new Map<string, number>();
  for (const reading of series) {
    const row: number[] = [];
    for (const name of names) {
      let v = Number(reading[name]);
      if (!Number.isFinite(v)) v = last.get(name) ?? 0;
      last.set(name, v);
      row.push(v);
    }
    values.push(row);
  }
  return { names, values };
}

function zeroMap(names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of names) out[n] = 0;
  return out;
}

/**
 * The macro read from the last TWO readings — the currency-pair insight.
 *
 * One number is nothing; two numbers show DIRECTION. Returns the per-dial
 * movement (sign + magnitude) between the two most recent readings.
 * Movements below `noiseFloor` read as 0.
 *
 * Handles: series shorter than two readings (zeros — no direction yet),
 * NaN (carried forward, never a movement), constant rooms (all zeros),
 * and noisy rooms (small moves floored to 0).
 */
export function direction(
  series: readonly PulseReading[],
  opts?: PerceptionOptions
): Record<string, number> {
  const floor = opts?.noiseFloor ?? DEFAULT_NOISE_FLOOR;
  const mat = toMatrix(series);
  const names = mat.names;
  if (mat.values.length < 2) return zeroMap(names);
  let dt = 1;
  if (opts?.ts) {
    const t = opts.ts.slice(-mat.values.length);
    dt = t[t.length - 1] - t[t.length - 2];
    if (!Number.isFinite(dt) || dt <= 1e-12) return zeroMap(names);
  }
  const floorOut = opts?.ts ? floor / dt : floor; // floor in output units
  const out: Record<string, number> = {};
  const lastRow = mat.values[mat.values.length - 1];
  const prevRow = mat.values[mat.values.length - 2];
  for (let i = 0; i < names.length; i++) {
    const d = (lastRow[i] - prevRow[i]) / dt;
    out[names[i]] = Math.abs(d) < floorOut ? 0 : d;
  }
  return out;
}

/**
 * The macro read from THREE+ readings.
 *
 * MORE THAN TWO numbers show RATE OF CHANGE. From the last three readings
 * this is the central second difference — the exact acceleration of the
 * quadratic interpolant through them (the fleetmath
 * `three_reading_kinematics` idea generalized to any dial series):
 *
 *     a = 2·(v23 − v12) / (t3 − t1),   v_ij = (x_j − x_i)/(t_j − t_i)
 *
 * With `ts` the rate is per second²; without it, per pulse².
 * Accelerations below `noiseFloor` read as 0. Constant rooms AND
 * constant-speed rooms have zero rate — only a CHANGE in the movement is
 * a rate.
 */
export function rateOfChange(
  series: readonly PulseReading[],
  opts?: PerceptionOptions
): Record<string, number> {
  const floor = opts?.noiseFloor ?? DEFAULT_NOISE_FLOOR;
  const mat = toMatrix(series);
  const names = mat.names;
  if (mat.values.length < 3) return zeroMap(names);
  const lastRow = mat.values[mat.values.length - 1];
  const midRow = mat.values[mat.values.length - 2];
  const firstRow = mat.values[mat.values.length - 3];
  const out: Record<string, number> = {};

  if (!opts?.ts) {
    for (let i = 0; i < names.length; i++) {
      const a = lastRow[i] - 2 * midRow[i] + firstRow[i];
      out[names[i]] = Math.abs(a) < floor ? 0 : a;
    }
    return out;
  }

  const t = opts.ts.slice(-mat.values.length);
  const dt12 = t[t.length - 2] - t[t.length - 3];
  const dt23 = t[t.length - 1] - t[t.length - 2];
  const dt13 = t[t.length - 1] - t[t.length - 3];
  if (!(dt12 > 1e-12 && dt23 > 1e-12 && dt13 > 1e-12)) return zeroMap(names);
  const floorOut = floor / (dt23 * dt23); // floor in output (per-s²) units
  for (let i = 0; i < names.length; i++) {
    const v12 = (midRow[i] - firstRow[i]) / dt12;
    const v23 = (lastRow[i] - midRow[i]) / dt23;
    const a = (2 * (v23 - v12)) / dt13; // exact quadratic interpolant
    out[names[i]] = Math.abs(a) < floorOut ? 0 : a;
  }
  return out;
}

function scalarDirection(series: readonly number[], floor: number): number {
  if (series.length < 2) return 0;
  const d = series[series.length - 1] - series[series.length - 2];
  return Math.abs(d) < floor ? 0 : d;
}

function scalarRate(series: readonly number[], floor: number): number {
  if (series.length < 3) return 0;
  const a =
    series[series.length - 1] -
    2 * series[series.length - 2] +
    series[series.length - 3];
  return Math.abs(a) < floor ? 0 : a;
}

/**
 * One pulse's macro read of the room — the trader's board.
 *
 * - direction / rateOfChange — the macro read per dial.
 * - warmth / warmthDirection / warmthRate — the headline: is the room
 *   warming or cooling, and is that movement accelerating or easing?
 * - dialDeltas — per-dial `{"direction", "rate"}` pairs.
 * - wholeHand — the room read AS A WHOLE: the macro, not any single dial.
 *
 * All movement values are per-pulse units, so the board reads like a
 * currency pair: the raw numbers don't matter, the movement is the
 * perception.
 */
export interface PerceptionReport {
  agentId: string;
  ts: number;
  nReadings: number;
  warmth: number;
  warmthDirection: number;
  warmthRate: number;
  direction: Record<string, number>;
  rateOfChange: Record<string, number>;
  dialDeltas: Record<string, { direction: number; rate: number }>;
  traffic: number;
  agentSaid: boolean;
  wholeHand: string;
}

/**
 * The perception check — the macro read of a pulse series.
 *
 * Direction from the last TWO readings; rate of change from the last
 * THREE+ (the second difference); per-dial deltas; and a scalar warmth
 * read (the mean of the `warmthDials` — default: all dials — per pulse,
 * NaN-carried like every dial). The warmth headline is the same math
 * applied to the warmth series itself.
 */
export class PerceptionCheck {
  readonly nReadings: number;
  readonly noiseFloor: number;
  readonly direction: Record<string, number>;
  readonly rateOfChange: Record<string, number>;
  readonly dialDeltas: Record<string, { direction: number; rate: number }>;
  readonly warmth: number;
  readonly warmthDirection: number;
  readonly warmthRate: number;

  constructor(
    series: readonly PulseReading[],
    opts?: PerceptionOptions & { warmthDials?: string[] }
  ) {
    const floor = opts?.noiseFloor ?? DEFAULT_NOISE_FLOOR;
    this.noiseFloor = floor;
    this.nReadings = series.length;
    this.direction = direction(series, opts);
    this.rateOfChange = rateOfChange(series, opts);

    const mat = toMatrix(series);
    this.dialDeltas = {};
    for (const name of mat.names) {
      this.dialDeltas[name] = {
        direction: this.direction[name] ?? 0,
        rate: this.rateOfChange[name] ?? 0,
      };
    }

    // Scalar warmth: mean of the warmth dials per pulse (default: all).
    const warmthDials = opts?.warmthDials ?? mat.names;
    const idx = warmthDials
      .map((n) => mat.names.indexOf(n))
      .filter((i) => i >= 0);
    const warmthSeries: number[] = [];
    for (const row of mat.values) {
      let sum = 0;
      for (const i of idx) sum += row[i];
      warmthSeries.push(idx.length > 0 ? sum / idx.length : 0);
    }
    this.warmth = warmthSeries.length > 0 ? warmthSeries[warmthSeries.length - 1] : 0;
    this.warmthDirection = scalarDirection(warmthSeries, floor);
    this.warmthRate = scalarRate(warmthSeries, floor);
  }

  /** Nothing is moving: direction AND rate both read as 0. */
  get isFlat(): boolean {
    return (
      this.nReadings >= 2 &&
      Math.abs(this.warmthDirection) <= this.noiseFloor &&
      Math.abs(this.warmthRate) <= this.noiseFloor
    );
  }

  /** The room reads cold — the warmth is falling. */
  get isCooling(): boolean {
    return this.warmthDirection < -this.noiseFloor;
  }

  /** The room reads warm — the warmth is rising. */
  get isWarming(): boolean {
    return this.warmthDirection > this.noiseFloor;
  }
}

// ──────────────────────────────────────────────
// The whole hand — the macro read in words
// ──────────────────────────────────────────────

/**
 * The room read AS A WHOLE — the macro in words. Deterministic: the
 * headline (warming / cooling / holding), the pace of that movement
 * (accelerating / easing / steady), the top three dials actually moving,
 * and whether the room is talking at all.
 */
export function composeWholeHand(
  report: PerceptionReport,
  noiseFloor: number = DEFAULT_NOISE_FLOOR
): string {
  const n = report.nReadings;
  if (n < 2) {
    return `Only ${n} pulse${n === 1 ? "" : "s"} in — the room hasn't moved enough to feel a hand yet.`;
  }
  const wd = report.warmthDirection;
  const wr = report.warmthRate;
  const head =
    wd > noiseFloor ? "the room is warming" : wd < -noiseFloor ? "the room is cooling" : "the room is holding steady";
  const pace =
    wr > noiseFloor
      ? "and the movement is accelerating"
      : wr < -noiseFloor
        ? "and the movement is easing"
        : "and the movement is steady";
  const movers: string[] = [];
  for (const [name, dd] of Object.entries(report.dialDeltas).sort(
    (a, b) => Math.abs(b[1].direction) - Math.abs(a[1].direction)
  )) {
    if (Math.abs(dd.direction) > noiseFloor) {
      movers.push(
        `${name} ${dd.direction > 0 ? "rising" : "falling"} ${Math.abs(dd.direction).toFixed(2)}/pulse`
      );
    }
    if (movers.length >= 3) break;
  }
  const moverTxt = movers.length > 0 ? movers.join(", ") : "no dial is moving";
  const trafficTxt =
    report.traffic > 0
      ? `${report.traffic} new message${report.traffic === 1 ? "" : "s"} crossed the room`
      : "the room is quiet";
  return `As a whole hand: ${head}, ${pace} — ${moverTxt}; ${trafficTxt}.`;
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The agent's silent thinking — 1-3 sentences of what it is noticing
 * WITHOUT speaking. This is the part that runs even when the agent says
 * nothing in the room.
 */
export function composeMonologue(
  report: PerceptionReport,
  prompt?: string,
  noiseFloor: number = DEFAULT_NOISE_FLOOR
): string {
  const n = report.nReadings;
  if (n < 2) {
    return "Only one pulse in — my ear is still warming to this room. Nothing to hold, nothing to say.";
  }
  const wd = report.warmthDirection;
  const head =
    wd > noiseFloor ? "the room is warming" : wd < -noiseFloor ? "the room is cooling" : "the room is holding";
  const wr = report.warmthRate;
  const pace =
    wr > noiseFloor
      ? "and the momentum is still building"
      : wr < -noiseFloor
        ? "and the momentum is easing"
        : "and the momentum is steady";
  const s1 = `I haven't said a word, but ${head} — ${pace}.`;
  let mover: [string, number] | null = null;
  for (const [name, dd] of Object.entries(report.dialDeltas).sort(
    (a, b) => Math.abs(b[1].direction) - Math.abs(a[1].direction)
  )) {
    if (Math.abs(dd.direction) > noiseFloor) {
      mover = [name, dd.direction];
      break;
    }
  }
  const s2 = mover
    ? `${cap(mover[0])} is the loudest hand on the room — ${mover[1] > 0 ? "rising" : "falling"} ${Math.abs(mover[1]).toFixed(2)} per pulse.`
    : "Nothing on the dials is moving enough to matter.";
  if (prompt !== undefined) {
    const focus = mover ? mover[0] : "the room";
    return `${s1} ${s2} Asked ${JSON.stringify(prompt)}: ${focus} tells the story.`;
  }
  return `${s1} ${s2}`;
}

// ──────────────────────────────────────────────
// The bridge — accept the elephant's readings
// ──────────────────────────────────────────────

/**
 * The elephant bridge: accept elephant dial readings as pulse input.
 *
 * Accepts:
 *   - a plain dial dict (the shape of `DialBank.readings(room)`), or
 *   - a bank-like object exposing `.readings(room?)` (an elephant
 *     `DialBank`, a `Space` adapter's bank, ...), or
 *   - a reader object exposing `.read(room?)`.
 *
 * Non-finite readings are coerced to 0 here; across a SERIES the
 * perception check carries them forward from the last valid reading
 * (a glitch is not a movement).
 */
export function readingFromDials(
  dials:
    | Record<string, number>
    | { readings(room?: unknown): Record<string, number> }
    | { read(room?: unknown): Record<string, number> }
): PulseReading {
  let dict: Record<string, number>;
  if (typeof dials === "object" && dials !== null) {
    const anyDials = dials as Record<string, unknown> & {
      readings?: () => Record<string, number>;
      read?: () => Record<string, number>;
    };
    if (typeof anyDials.readings === "function") {
      dict = anyDials.readings();
    } else if (typeof anyDials.read === "function") {
      dict = anyDials.read();
    } else {
      dict = anyDials as Record<string, number>;
    }
  } else {
    dict = {};
  }
  const out: PulseReading = {};
  for (const [k, v] of Object.entries(dict)) {
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

/**
 * The engine's own dials, from a GroupFlow — the flow snapshot becomes
 * a pulse reading. All dials are 0-1 normalized so a group flow reads
 * like an elephant room: energy is the sauna's roar, convergence is the
 * herd's lockstep, novelty is the warm hand on the table.
 */
export function flowToReading(flow: GroupFlow): PulseReading {
  return {
    energy: flow.energyLevel,
    convergence: flow.convergenceScore,
    diversity: flow.vocabularyDiversity,
    disagreement: Math.min(1, flow.disagreementCount / 5),
    novelty: Math.min(1, flow.novelIdeaCount / 5),
    crossPollination: Math.min(1, flow.crossPollinationCount / 3),
    exchange: Math.min(1, flow.exchangeRate / 20),
  };
}

// ──────────────────────────────────────────────
// The PulseLoop — an agent's constant sensing heartbeat
// ──────────────────────────────────────────────

export interface PulseSource {
  /** Read the room's dials for this pulse. */
  read(): PulseReading | Record<string, number>;
  /** New messages/traffic since the last pulse (optional). */
  traffic?(): number;
  /** Did the agent itself speak since the last pulse? (optional). */
  agentSaid?(): boolean;
}

/** A pulse source: an object, or a bare reader function. */
export type PulseSourceLike =
  | PulseSource
  | (() => PulseReading | Record<string, number>);

export interface PulseLoopConfig {
  /** Seconds between pulses (default 5). */
  period?: number;
  /** Rolling history window, in pulses (default 20). */
  history?: number;
  /** Per-pulse moves below this floor read as 0 (default 0.02). */
  noiseFloor?: number;
  /** Dials composing the scalar warmth read (default: all dials). */
  warmthDials?: string[];
}

const DEFAULT_PULSE_CONFIG: Required<PulseLoopConfig> = {
  period: 5,
  history: 20,
  noiseFloor: DEFAULT_NOISE_FLOOR,
  warmthDials: [],
};

function normalizeSource(source: PulseSourceLike): PulseSource {
  if (typeof source === "function") return { read: source };
  return source;
}

/**
 * An agent's constant sensing heartbeat.
 *
 * Ticks on an interval even when the agent isn't speaking or acting.
 * Each tick reads the room's dials, appends to a rolling history, and
 * runs a perception check — direction from the last two readings, rate
 * of change from the last three+. `internalMonologue()` is the silent
 * thinking that runs regardless of whether the agent says anything.
 *
 * The source is any `PulseSource` — an elephant `DialBank`-style reader
 * (via `readingFromDials`), a bare `() => reading` function, or a
 * `GroupFlow` snapshot mapped by `flowToReading`.
 */
export class PulseLoop {
  readonly agentId: string;
  readonly config: Required<PulseLoopConfig>;
  private source: PulseSource;
  private readings: PulseReading[] = [];
  private ts: number[] = [];
  private clock = 0;
  private lastTs: number | null = null;
  private lastReport: PerceptionReport | null = null;
  private lastTrafficCount = 0;

  constructor(
    agentId: string,
    source: PulseSourceLike,
    config?: PulseLoopConfig
  ) {
    this.agentId = agentId;
    this.source = normalizeSource(source);
    this.config = { ...DEFAULT_PULSE_CONFIG, ...config };
  }

  /** Is a pulse due? True when the caller's clock has advanced at least
   * one `period` past the last tick (or no tick yet). */
  due(now: number): boolean {
    return (
      this.lastTs === null || Number(now) - this.lastTs >= this.config.period
    );
  }

  /**
   * One pulse: read the room, record the reading, run the perception
   * check, return the PerceptionReport. Ticks at or before the last tick
   * are ignored (the heartbeat doesn't double-beat) and return the last
   * report unchanged. Runs whether or not the agent acted — the silence
   * is not empty.
   */
  tick(now?: number): PerceptionReport {
    if (now === undefined) now = this.clock;
    now = Number(now);
    if (this.lastTs !== null && now <= this.lastTs) {
      return this.lastReport ?? this.zeroReport(now);
    }

    const reading = readingFromDials(this.source.read());
    let traffic = 0;
    let agentSaid = false;
    if (this.source.traffic) {
      const t = this.source.traffic();
      traffic = t < this.lastTrafficCount ? 0 : Math.max(0, t - this.lastTrafficCount);
      this.lastTrafficCount = t;
    }
    if (this.source.agentSaid) agentSaid = Boolean(this.source.agentSaid());

    this.readings.push(reading);
    this.ts.push(now);
    if (this.readings.length > this.config.history) {
      this.readings.shift();
      this.ts.shift();
    }

    this.lastTs = now;
    this.clock = Math.max(this.clock, now + this.config.period);

    const check = new PerceptionCheck(this.readings, {
      noiseFloor: this.config.noiseFloor,
      warmthDials:
        this.config.warmthDials.length > 0 ? this.config.warmthDials : undefined,
    });
    const report: PerceptionReport = {
      agentId: this.agentId,
      ts: now,
      nReadings: check.nReadings,
      warmth: check.warmth,
      warmthDirection: check.warmthDirection,
      warmthRate: check.warmthRate,
      direction: check.direction,
      rateOfChange: check.rateOfChange,
      dialDeltas: check.dialDeltas,
      traffic,
      agentSaid,
      wholeHand: "",
    };
    report.wholeHand = composeWholeHand(report, this.config.noiseFloor);
    this.lastReport = report;
    return report;
  }

  /** Convenience alias: one tick on the internal clock (advances by
   * `period` each beat). */
  pulse(): PerceptionReport {
    return this.tick();
  }

  /**
   * The agent's silent thinking — 1-3 sentences of what it is noticing
   * WITHOUT speaking. This is the part that runs even when the agent
   * says nothing in the room.
   */
  internalMonologue(prompt?: string): string {
    const report = this.lastReport;
    if (report === null) {
      return "I've taken no pulses yet — my ear is still warming to this room.";
    }
    return composeMonologue(report, prompt, this.config.noiseFloor);
  }

  /** The raw pulse series — the numbers that don't matter individually.
   * Direction lives in the last two; rate of change in the last three+. */
  lastReadings(): PulseReading[] {
    return this.readings.map((r) => ({ ...r }));
  }

  /** The most recent PerceptionReport (null before the first tick). */
  lastReportSafe(): PerceptionReport | null {
    return this.lastReport;
  }

  private zeroReport(now: number): PerceptionReport {
    const report: PerceptionReport = {
      agentId: this.agentId,
      ts: now,
      nReadings: 0,
      warmth: 0,
      warmthDirection: 0,
      warmthRate: 0,
      direction: {},
      rateOfChange: {},
      dialDeltas: {},
      traffic: 0,
      agentSaid: false,
      wholeHand: "",
    };
    report.wholeHand = composeWholeHand(report, this.config.noiseFloor);
    return report;
  }

  get length(): number {
    return this.readings.length;
  }

  toString(): string {
    return `<PulseLoop ${this.agentId} period=${this.config.period}s history=${this.readings.length}/${this.config.history}>`;
  }
}

// ──────────────────────────────────────────────
// The DriveModulator — perception → drives
// ──────────────────────────────────────────────

export type DriveMode = "cold" | "flat" | "warm" | "seeking" | "calm";

export interface DriveState {
  /** 0-1 — starving for warmth/interruption. Accelerates when the room
   * reads cold, decays when the room is warm. */
  hunger: number;
  /** 0-1 — nothing is moving. Rises when rate ≈ 0, dissolves when the
   * room moves. */
  stagnation: number;
  /** Actively seeking warmth — the engine's force-seek mode, driven by
   * perception instead of a timer. */
  forceSeek: boolean;
  /** The room's reading: cold | flat | warm | seeking | calm. */
  mode: DriveMode;
}

export interface DriveModulatorConfig {
  /** Per-pulse moves below this floor read as 0 (default 0.02). */
  noiseFloor?: number;
  /** Same reading must hold for this many consecutive pulses before the
   * drives ring — the deadband. A single glitch or noise spike never
   * changes agent behaviour (default 2). */
  confirmPulses?: number;
  /** Warmth below this reads cold when not already cold (default 0.33). */
  coldEnterThreshold?: number;
  /** Once cold, warmth must rise above this to stop reading cold —
   * hysteresis (default 0.38). */
  coldExitThreshold?: number;
  /** Warmth at/above this reads warm when not already warm (default 0.62). */
  warmEnterThreshold?: number;
  /** Once warm, warmth must drop below this to stop reading warm —
   * hysteresis (default 0.57). */
  warmExitThreshold?: number;
  /** Direction pointing to warmth above this triggers force-seek
   * (default 0.08). */
  seekDirectionThreshold?: number;
  /** Hunger gained per pulse when the room reads cold (default 0.06). */
  hungerGainCold?: number;
  /** Hunger gained per pulse when the room is cold AND flat
   * (default 0.03). */
  hungerGainColdFlat?: number;
  /** Hunger lost per pulse when the room is warm (default 0.08). */
  hungerDecayWarm?: number;
  /** Stagnation gained per pulse when nothing moves (default 0.08). */
  stagnationGainFlat?: number;
  /** Stagnation lost per pulse when the room moves (default 0.05). */
  stagnationDecayMoving?: number;
}

const DEFAULT_DRIVE_CONFIG: Required<DriveModulatorConfig> = {
  noiseFloor: DEFAULT_NOISE_FLOOR,
  confirmPulses: 2,
  coldEnterThreshold: 0.33,
  coldExitThreshold: 0.38,
  warmEnterThreshold: 0.62,
  warmExitThreshold: 0.57,
  seekDirectionThreshold: 0.08,
  hungerGainCold: 0.06,
  hungerGainColdFlat: 0.03,
  hungerDecayWarm: 0.08,
  stagnationGainFlat: 0.08,
  stagnationDecayMoving: 0.05,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Perception → drives. Maps the elephant's semantics into the engine's
 * drive model:
 *
 *   - COLD room (warmth falling, or warmth below the cold threshold):
 *     hunger accelerates and force-seek fires — the agent seeks warmth.
 *     (Force-seek isn't a flag — it's a room that reads cold and the
 *     agent seeking warmth.) A cold room that is ALSO flat feels both
 *     hunger and despair — stagnation rises too.
 *   - Direction pointing to WARMTH (the room is warming): force-seek
 *     fires — the agent chases the warmth. Seeking is the RESPONSE to
 *     cold, not an extra hunger trigger — hunger does not rise.
 *   - FLAT room (rate ≈ 0): stagnation accumulates. (Stagnation isn't a
 *     timer — it's the perception that nothing is moving.)
 *   - WARM room: every drive calms — hunger decays, stagnation
 *     dissolves, force-seek switches off.
 *
 * The deadband rings up the chain: a reading must CONFIRM for
 * `confirmPulses` consecutive pulses before any drive moves (no single
 * glitch or noise spike changes agent behaviour), and the warmth
 * thresholds carry hysteresis (enter cold below 0.33, leave above 0.38;
 * enter warm above 0.62, leave below 0.57) so a room hovering at a
 * boundary doesn't ping-pong the drives.
 *
 * Stateful: `modulate()` accumulates hunger/stagnation across pulses
 * (clamped 0-1); `state()` reads the current drives without advancing;
 * `reset()` clears.
 */
export class DriveModulator {
  private config: Required<DriveModulatorConfig>;
  private hunger = 0;
  private stagnation = 0;
  private lastSensedMode: DriveMode | null = null;
  private modeVotes = 0;
  private confirmedMode: DriveMode | null = null;
  private confirmedForceSeek = false;

  constructor(config?: DriveModulatorConfig) {
    this.config = { ...DEFAULT_DRIVE_CONFIG, ...config };
  }

  /** Classify the room's reading for this pulse, with hysteresis. */
  private sense(check: PerceptionCheck): DriveMode {
    const cfg = this.config;
    const { warmth, warmthDirection, warmthRate, nReadings } = check;
    const pointingToWarmth = warmthDirection > cfg.seekDirectionThreshold;
    // Hysteresis: the threshold to ENTER a state differs from the
    // threshold to LEAVE it, so a room hovering at a boundary doesn't
    // flip-flop the drives pulse to pulse.
    const coldExit = this.lastSensedMode === "cold"
      ? cfg.coldExitThreshold
      : cfg.coldEnterThreshold;
    const warmExit = this.lastSensedMode === "warm"
      ? cfg.warmExitThreshold
      : cfg.warmEnterThreshold;
    const cold =
      !pointingToWarmth &&
      (warmthDirection < -cfg.noiseFloor ||
        warmthRate < -cfg.noiseFloor ||
        warmth < coldExit);
    const warm =
      warmth >= warmExit && warmthDirection >= -cfg.noiseFloor;
    const flat =
      nReadings >= 2 &&
      Math.abs(warmthDirection) <= cfg.noiseFloor &&
      Math.abs(warmthRate) <= cfg.noiseFloor;
    if (pointingToWarmth && !warm) return "seeking";
    if (cold) return "cold";
    if (warm) return "warm";
    if (flat) return "flat";
    return "calm";
  }

  /** One pulse's worth of drive update. Feed it the pulse's perception
   * check and it returns the agent's drives for this moment. */
  modulate(check: PerceptionCheck): DriveState {
    const sensed = this.sense(check);
    if (sensed === this.lastSensedMode) {
      this.modeVotes += 1;
    } else {
      this.lastSensedMode = sensed;
      this.modeVotes = 1;
    }
    // The deadband: only a CONFIRMED reading rings up the drives.
    if (this.modeVotes >= this.config.confirmPulses) {
      this.applyDrive(sensed, check);
    }
    return this.state();
  }

  private applyDrive(mode: DriveMode, check: PerceptionCheck): void {
    const cfg = this.config;
    const flat = check.isFlat;
    switch (mode) {
      case "cold": {
        // A room that reads cold — the agent seeks warmth.
        this.hunger = clamp01(
          this.hunger + (flat ? cfg.hungerGainColdFlat : cfg.hungerGainCold)
        );
        if (flat) {
          // Cold AND stuck is the worst state: hunger and despair.
          this.stagnation = clamp01(this.stagnation + cfg.stagnationGainFlat);
        }
        this.confirmedMode = "cold";
        this.confirmedForceSeek = true;
        break;
      }
      case "seeking": {
        // Direction points to warmth — the agent chases it. Seeking is
        // the response, not an extra hunger trigger.
        this.confirmedMode = "seeking";
        this.confirmedForceSeek = true;
        break;
      }
      case "flat": {
        // Nothing is moving — stagnation is the perception of that.
        this.stagnation = clamp01(this.stagnation + cfg.stagnationGainFlat);
        this.confirmedMode = "flat";
        this.confirmedForceSeek = false;
        break;
      }
      case "warm": {
        // Warm rooms calm every drive — even when holding steady.
        this.hunger = clamp01(this.hunger - cfg.hungerDecayWarm);
        this.stagnation = clamp01(this.stagnation - cfg.stagnationDecayMoving);
        this.confirmedMode = "warm";
        this.confirmedForceSeek = false;
        break;
      }
      default: {
        // Calm, but moving — movement dissolves stagnation.
        this.stagnation = clamp01(this.stagnation - cfg.stagnationDecayMoving);
        this.confirmedMode = "calm";
        this.confirmedForceSeek = false;
        break;
      }
    }
  }

  /** The current drives, without advancing the accumulation. */
  state(): DriveState {
    return {
      hunger: this.hunger,
      stagnation: this.stagnation,
      forceSeek: this.confirmedForceSeek,
      mode: this.confirmedMode ?? "calm",
    };
  }

  /** Clear accumulated hunger/stagnation and the confirmation memory. */
  reset(): void {
    this.hunger = 0;
    this.stagnation = 0;
    this.lastSensedMode = null;
    this.modeVotes = 0;
    this.confirmedMode = null;
    this.confirmedForceSeek = false;
  }
}
