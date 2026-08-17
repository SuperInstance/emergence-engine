// tests/test_pulseHeartbeat.test.ts
// Deep tests for the Pulse Heartbeat — the engine's agents think in
// pulses even when idle.
//
// Cross-pollinated from the elephant (elephant/pulse.py): agents run
// internal monologues on CONSTANT PULSES even when they aren't talking,
// and each pulse runs a perception check — ONE number is nothing; TWO
// numbers show DIRECTION; MORE THAN TWO show RATE OF CHANGE.
//
// Tests cover: pulses running without the agent acting, direction/rate
// math, the elephant drive mapping (cold → hunger/force-seek, flat →
// stagnation, warm → calm), the reading bridge, and the full loop.

import { describe, it, expect } from "vitest";
import {
  PerceptionCheck,
  PulseLoop,
  DriveModulator,
  direction,
  rateOfChange,
  composeWholeHand,
  composeMonologue,
  readingFromDials,
  flowToReading,
  DEFAULT_NOISE_FLOOR,
  type PerceptionReport,
  type DriveState,
} from "../src/pulseHeartbeat.js";
import type { GroupFlow } from "../src/types.js";

function makeFlow(overrides?: Partial<GroupFlow>): GroupFlow {
  return {
    events: [],
    participantIds: ["alice", "bob"],
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    convergenceScore: 0.3,
    energyLevel: 0.6,
    vocabularyDiversity: 0.5,
    disagreementCount: 1,
    novelIdeaCount: 1,
    crossPollinationCount: 0,
    averageMessageLength: 80,
    exchangeRate: 8,
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// The perception-check math — two numbers show direction,
// three+ show rate of change
// ──────────────────────────────────────────────

describe("direction — the macro read from the last TWO readings", () => {
  it("returns zeros when the series is too short to show direction", () => {
    expect(direction([])).toEqual({});
    expect(direction([{ mood: 0.5 }])).toEqual({ mood: 0 });
  });

  it("shows direction from the last two readings", () => {
    const d = direction([
      { mood: 0.1, cynicism: 0.4 },
      { mood: 0.41, cynicism: 0.35 },
    ]);
    expect(d.mood).toBeCloseTo(0.31, 9);
    expect(d.cynicism).toBeCloseTo(-0.05, 9);
  });

  it("reads a constant room as zero — no movement, no perception", () => {
    const series = [
      { mood: 0.3 },
      { mood: 0.3 },
      { mood: 0.3 },
      { mood: 0.3 },
    ];
    expect(direction(series)).toEqual({ mood: 0 });
  });

  it("floors small moves below the noise floor to 0", () => {
    const d = direction([{ mood: 0.5 }, { mood: 0.501 }]);
    expect(d.mood).toBe(0);
    const loud = direction([{ mood: 0.5 }, { mood: 0.6 }], { noiseFloor: 0.05 });
    expect(loud.mood).toBeCloseTo(0.1, 9);
  });

  it("carries NaN forward — a glitch is NOT a movement", () => {
    const d = direction([
      { mood: 0.1 },
      { mood: Number.NaN },
      { mood: 0.31 },
    ]);
    expect(d.mood).toBeCloseTo(0.21, 9);
  });

  it("normalizes per second when timestamps are given", () => {
    const d = direction(
      [
        { mood: 0.0 },
        { mood: 0.1 },
      ],
      { ts: [0, 2] }
    );
    expect(d.mood).toBeCloseTo(0.05, 9);
  });
});

describe("rateOfChange — the macro read from THREE+ readings", () => {
  it("returns zeros when the series is too short to show rate", () => {
    expect(rateOfChange([])).toEqual({});
    expect(rateOfChange([{ mood: 0.5 }])).toEqual({ mood: 0 });
    expect(rateOfChange([{ mood: 0.5 }, { mood: 0.6 }])).toEqual({ mood: 0 });
  });

  it("detects acceleration from the last three readings", () => {
    // mood 0.0 → 0.2 → 0.5 : the rise itself is rising
    const r = rateOfChange([{ mood: 0.0 }, { mood: 0.2 }, { mood: 0.5 }]);
    expect(r.mood).toBeCloseTo(0.1, 9);
  });

  it("detects deceleration (easing) from the last three readings", () => {
    // mood 0.5 → 0.4 → 0.2 : the fall is accelerating — negative rate
    const r = rateOfChange([{ mood: 0.5 }, { mood: 0.4 }, { mood: 0.2 }]);
    expect(r.mood).toBeCloseTo(-0.1, 9);
  });

  it("reads a constant-SPEED room as zero rate — only a change in the movement is a rate", () => {
    const r = rateOfChange([
      { mood: 0.0 },
      { mood: 0.2 },
      { mood: 0.4 },
      { mood: 0.6 },
    ]);
    expect(r.mood).toBe(0);
  });

  it("floors small accelerations below the noise floor to 0", () => {
    const r = rateOfChange([{ mood: 0.0 }, { mood: 0.201 }, { mood: 0.402 }]);
    expect(r.mood).toBe(0);
  });

  it("carries NaN forward across three readings", () => {
    const r = rateOfChange([
      { mood: 0.0 },
      { mood: Number.NaN },
      { mood: 0.1 },
      { mood: 0.4 },
    ]);
    // carried: 0.0 → 0.0 → 0.1 → 0.4 ⇒ a = 0.4 - 2·0.1 + 0.0 = 0.2
    expect(r.mood).toBeCloseTo(0.2, 9);
  });
});

describe("PerceptionCheck — the macro read of a pulse series", () => {
  it("computes direction, rate, and per-dial deltas", () => {
    const check = new PerceptionCheck([
      { mood: 0.1, cynicism: 0.4 },
      { mood: 0.2, cynicism: 0.35 },
      { mood: 0.41, cynicism: 0.3 },
    ]);
    expect(check.direction.mood).toBeCloseTo(0.21, 9);
    expect(check.rateOfChange.mood).toBeCloseTo(0.11, 9);
    expect(check.dialDeltas.mood).toEqual({
      direction: check.direction.mood,
      rate: check.rateOfChange.mood,
    });
    expect(check.nReadings).toBe(3);
  });

  it("reads a warming room: direction positive, rate positive", () => {
    const check = new PerceptionCheck([
      { mood: -1.0 },
      { mood: -0.5 },
      { mood: 0.2 },
    ]);
    expect(check.warmthDirection).toBeGreaterThan(0);
    expect(check.warmthRate).toBeGreaterThan(0);
    expect(check.isWarming).toBe(true);
    expect(check.isFlat).toBe(false);
  });

  it("reads a cooling room: direction negative", () => {
    const check = new PerceptionCheck([
      { mood: 0.5 },
      { mood: 0.2 },
      { mood: -0.1 },
    ]);
    expect(check.warmthDirection).toBeLessThan(0);
    expect(check.isCooling).toBe(true);
  });

  it("reads a flat room: rate ≈ 0, isFlat true", () => {
    const check = new PerceptionCheck([
      { mood: 0.45 },
      { mood: 0.45 },
      { mood: 0.45 },
    ]);
    expect(check.warmthDirection).toBe(0);
    expect(check.warmthRate).toBe(0);
    expect(check.isFlat).toBe(true);
  });

  it("scopes the warmth scalar to warmthDials when given", () => {
    const check = new PerceptionCheck(
      [
        { mood: 0.9, panic: 0.1 },
        { mood: 0.9, panic: 0.1 },
      ],
      { warmthDials: ["mood"] }
    );
    expect(check.warmth).toBeCloseTo(0.9, 9);
  });
});

// ──────────────────────────────────────────────
// The PulseLoop — the heartbeat that runs in the silence
// ──────────────────────────────────────────────

describe("PulseLoop — pulses run without the agent acting", () => {
  it("ticks and produces perception reports even when the agent never acts", () => {
    let reading = { mood: 0.2, cynicism: 0.3 };
    const loop = new PulseLoop("silent-writer", () => reading);
    expect(loop.length).toBe(0);
    expect(loop.internalMonologue()).toContain("no pulses");

    const r1 = loop.tick(0);
    expect(r1.nReadings).toBe(1);
    expect(loop.length).toBe(1);

    reading = { mood: 0.4, cynicism: 0.2 };
    const r2 = loop.tick(5);
    expect(r2.nReadings).toBe(2);
    expect(r2.warmthDirection).toBeGreaterThan(0);

    // The monologue runs in the silence — the agent said nothing.
    const monologue = loop.internalMonologue();
    expect(monologue).toContain("I haven't said a word");
    expect(r1.agentSaid).toBe(false);
    expect(r1.traffic).toBe(0);
  });

  it("advances its internal clock with pulse()", () => {
    const loop = new PulseLoop("clock-walker", () => ({ energy: 0.5 }));
    loop.pulse();
    loop.pulse();
    loop.pulse();
    expect(loop.length).toBe(3);
    const report = loop.lastReportSafe();
    expect(report).not.toBeNull();
    expect(report!.ts).toBeCloseTo(10, 9); // period 5 × 2 beats
  });

  it("due() gates pulses on the period and ignores stale ticks", () => {
    const loop = new PulseLoop("gated", () => ({ energy: 0.5 }), {
      period: 3,
    });
    expect(loop.due(0)).toBe(true);
    loop.tick(0);
    expect(loop.due(1)).toBe(false);
    expect(loop.due(3)).toBe(true);

    const stale = loop.tick(0); // at the last tick — no double-beat
    expect(stale.ts).toBe(0);
    expect(loop.length).toBe(1);
  });

  it("keeps a bounded rolling history", () => {
    const loop = new PulseLoop("bounded", () => ({ energy: 0.5 }), {
      period: 1,
      history: 3,
    });
    for (let t = 0; t < 10; t++) loop.tick(t);
    expect(loop.length).toBe(3);
    expect(loop.lastReadings()).toHaveLength(3);
  });

  it("tracks traffic and agent speech via the source", () => {
    let messages = 0;
    const loop = new PulseLoop(
      "talker",
      {
        read: () => ({ energy: 0.5 }),
        traffic: () => messages,
        agentSaid: () => true,
      },
      { period: 1 }
    );
    messages = 3;
    const r1 = loop.tick(0);
    expect(r1.traffic).toBe(3);
    expect(r1.agentSaid).toBe(true);
    messages = 5;
    const r2 = loop.tick(1);
    expect(r2.traffic).toBe(2);
  });
});

// ──────────────────────────────────────────────
// The internal monologue and the whole hand
// ──────────────────────────────────────────────

describe("composeMonologue / composeWholeHand — the silence is not empty", () => {
  function report(overrides?: Partial<PerceptionReport>): PerceptionReport {
    return {
      agentId: "a",
      ts: 5,
      nReadings: 3,
      warmth: 0.4,
      warmthDirection: 0.2,
      warmthRate: 0.05,
      direction: { mood: 0.2 },
      rateOfChange: { mood: 0.05 },
      dialDeltas: { mood: { direction: 0.2, rate: 0.05 } },
      traffic: 2,
      agentSaid: false,
      wholeHand: "",
      ...overrides,
    };
  }

  it("composes the whole hand — the macro read in words", () => {
    const text = composeWholeHand(report());
    expect(text).toContain("the room is warming");
    expect(text).toContain("mood rising 0.20/pulse");
    expect(text).toContain("2 new messages crossed the room");
  });

  it("composes a 1-3 sentence silent monologue even when nothing moves", () => {
    const flat = report({
      warmthDirection: 0,
      warmthRate: 0,
      dialDeltas: { mood: { direction: 0, rate: 0 } },
    });
    const text = composeMonologue(flat);
    expect(text).toContain("the room is holding");
    expect(text).toContain("Nothing on the dials is moving enough to matter.");
  });

  it("weaves a prompt into the thinking", () => {
    const text = composeMonologue(report(), "is the room warming?");
    expect(text).toContain('Asked "is the room warming?"');
    expect(text).toContain("mood tells the story");
  });
});

// ──────────────────────────────────────────────
// The DriveModulator — perception → drives
// ──────────────────────────────────────────────

describe("DriveModulator — the elephant semantics in the engine's drives", () => {
  function coldRoom(): PerceptionCheck {
    // The room is cooling: warmth falls across pulses.
    return new PerceptionCheck([
      { energy: 0.7, convergence: 0.6 },
      { energy: 0.5, convergence: 0.55 },
      { energy: 0.2, convergence: 0.5 },
    ]);
  }

  function coldFlatRoom(): PerceptionCheck {
    // Cold AND stuck — the worst state.
    return new PerceptionCheck([
      { energy: 0.2 },
      { energy: 0.2 },
      { energy: 0.2 },
    ]);
  }

  function flatRoom(): PerceptionCheck {
    return new PerceptionCheck([
      { energy: 0.45, convergence: 0.5 },
      { energy: 0.45, convergence: 0.5 },
      { energy: 0.45, convergence: 0.5 },
    ]);
  }

  function warmRoom(): PerceptionCheck {
    return new PerceptionCheck([
      { energy: 0.62 },
      { energy: 0.65 },
      { energy: 0.68 },
    ]);
  }

  it("COLD room drives hunger and force-seek", () => {
    const mod = new DriveModulator();
    mod.modulate(coldRoom()); // first confirmation pulse — the deadband listens
    const state = mod.modulate(coldRoom()); // confirmed: the drive rings
    expect(state.hunger).toBeGreaterThan(0);
    expect(state.forceSeek).toBe(true);
    expect(state.mode).toBe("cold");
    expect(state.stagnation).toBe(0);
  });

  it("cold hunger accumulates across pulses and clamps at 1", () => {
    const mod = new DriveModulator({ hungerGainCold: 0.4 });
    for (let i = 0; i < 5; i++) {
      mod.modulate(
        new PerceptionCheck([
          { energy: 0.6 - i * 0.05 },
          { energy: 0.5 - i * 0.05 },
          { energy: 0.3 - i * 0.05 },
        ])
      );
    }
    expect(mod.state().hunger).toBe(1);
  });

  it("a cold-but-flat room hungers AND despairs — the worst state", () => {
    const mod = new DriveModulator();
    mod.modulate(coldFlatRoom());
    const state = mod.modulate(coldFlatRoom());
    expect(state.hunger).toBeGreaterThan(0);
    expect(state.stagnation).toBeGreaterThan(0);
    expect(state.forceSeek).toBe(true);
    expect(state.mode).toBe("cold");
  });

  it("FLAT room drives stagnation — the perception that nothing moves", () => {
    const mod = new DriveModulator();
    mod.modulate(flatRoom());
    const state = mod.modulate(flatRoom());
    expect(state.stagnation).toBeGreaterThan(0);
    expect(state.mode).toBe("flat");
    expect(state.forceSeek).toBe(false);
    expect(state.hunger).toBe(0);
  });

  it("stagnation accumulates on repeated flat pulses", () => {
    const mod = new DriveModulator();
    for (let i = 0; i < 3; i++) mod.modulate(flatRoom());
    expect(mod.state().stagnation).toBeCloseTo(0.16, 9);
  });

  it("WARM room calms every drive", () => {
    const mod = new DriveModulator();
    // Starve it first in a cold room…
    mod.modulate(coldRoom());
    mod.modulate(coldRoom());
    const hungry = mod.state();
    expect(hungry.hunger).toBeGreaterThan(0);
    expect(hungry.forceSeek).toBe(true);

    // …then warm the room. The first warm pulse confirms the reading
    // (deadband) — drives stay frozen; the second rings the calm.
    const warm1 = mod.modulate(warmRoom());
    expect(warm1.hunger).toBe(hungry.hunger);
    expect(warm1.forceSeek).toBe(true); // still frozen on the old cold read

    const warm2 = mod.modulate(warmRoom());
    expect(warm2.mode).toBe("warm");
    expect(warm2.hunger).toBeLessThan(hungry.hunger);
    expect(warm2.forceSeek).toBe(false);

    const calmer = mod.modulate(
      new PerceptionCheck([
        { energy: 0.66 },
        { energy: 0.66 },
        { energy: 0.66 },
      ])
    );
    expect(calmer.hunger).toBe(0);
    expect(calmer.stagnation).toBe(0);
  });

  it("direction pointing to WARMTH triggers force-seek without hunger — seeking is the response, not a trigger", () => {
    const mod = new DriveModulator();
    const chasing = new PerceptionCheck([
      { energy: 0.3 },
      { energy: 0.4 },
      { energy: 0.5 },
    ]);
    mod.modulate(chasing);
    const state = mod.modulate(chasing);
    expect(state.forceSeek).toBe(true);
    expect(state.mode).toBe("seeking");
    expect(state.hunger).toBe(0);
  });

  it("movement dissolves accumulated stagnation", () => {
    const mod = new DriveModulator();
    for (let i = 0; i < 3; i++) mod.modulate(flatRoom());
    expect(mod.state().stagnation).toBeGreaterThan(0);

    const moving = new PerceptionCheck([
      { energy: 0.45 },
      { energy: 0.6 },
      { energy: 0.7 },
    ]);
    mod.modulate(moving); // confirms the new warm read
    const dissolved = mod.modulate(moving); // the calm rings
    expect(dissolved.stagnation).toBeLessThan(0.16);
  });

  it("the deadband: a single cold blip does NOT ring the drives", () => {
    const mod = new DriveModulator();
    // One cold pulse, then the room recovers — no drive should move.
    const blip = mod.modulate(coldRoom());
    expect(blip.hunger).toBe(0);
    expect(blip.forceSeek).toBe(false);
    expect(blip.mode).toBe("calm");

    // Two further cold pulses confirm the read and the hunger rings.
    mod.modulate(coldRoom());
    const state = mod.modulate(coldRoom());
    expect(state.hunger).toBeGreaterThan(0);
    expect(state.forceSeek).toBe(true);
  });

  it("hysteresis: a room hovering at the cold boundary doesn't ping-pong", () => {
    const mod = new DriveModulator();
    mod.modulate(coldRoom());
    mod.modulate(coldRoom());
    expect(mod.state().mode).toBe("cold");

    // 0.36 is above the enter threshold (0.33) but below the cold EXIT
    // (0.38) — the room is still cold; hunger keeps rising.
    const hovering = new PerceptionCheck([
      { energy: 0.36 },
      { energy: 0.36 },
      { energy: 0.36 },
    ]);
    const stillCold = mod.modulate(hovering);
    expect(stillCold.mode).toBe("cold");

    // Crossing 0.38 leaves the cold — the room goes flat (not warm yet).
    const crossed = new PerceptionCheck([
      { energy: 0.39 },
      { energy: 0.39 },
      { energy: 0.39 },
    ]);
    const notCold = mod.modulate(crossed);
    expect(notCold.hunger).toBeGreaterThan(0); // frozen — no new gain
    const flatNow = mod.modulate(crossed);
    expect(flatNow.mode).toBe("flat");
    expect(flatNow.stagnation).toBeGreaterThan(0);
  });

  it("reset() clears accumulated drives and the confirmation memory", () => {
    const mod = new DriveModulator();
    mod.modulate(coldRoom());
    mod.modulate(coldRoom());
    expect(mod.state().hunger).toBeGreaterThan(0);
    mod.reset();
    const state: DriveState = mod.state();
    expect(state.hunger).toBe(0);
    expect(state.stagnation).toBe(0);
    expect(state.forceSeek).toBe(false);
    expect(state.mode).toBe("calm");
  });
});

// ──────────────────────────────────────────────
// The bridge — accept the elephant's readings
// ──────────────────────────────────────────────

describe("readingFromDials — the elephant bridge", () => {
  it("accepts a plain dial dict (DialBank.readings() shape)", () => {
    const reading = readingFromDials({ mood: 0.31, cynicism: -0.05 });
    expect(reading).toEqual({ mood: 0.31, cynicism: -0.05 });
  });

  it("accepts a bank-like object with a readings() method", () => {
    const bankLike = {
      readings: () => ({ mood: 0.4, panic: 0.1 }),
    };
    expect(readingFromDials(bankLike)).toEqual({ mood: 0.4, panic: 0.1 });
  });

  it("accepts a reader object with a read() method", () => {
    const reader = { read: () => ({ volume: 0.8 }) };
    expect(readingFromDials(reader)).toEqual({ volume: 0.8 });
  });

  it("coerces non-finite readings to 0", () => {
    const reading = readingFromDials({
      mood: Number.NaN,
      volume: Number.POSITIVE_INFINITY,
      earnestness: 0.5,
    });
    expect(reading).toEqual({ mood: 0, volume: 0, earnestness: 0.5 });
  });

  it("handles empty input", () => {
    expect(readingFromDials({})).toEqual({});
  });
});

describe("flowToReading — the engine's own flow becomes pulse dials", () => {
  it("maps a GroupFlow into normalized 0-1 dials", () => {
    const reading = flowToReading(
      makeFlow({
        energyLevel: 0.8,
        convergenceScore: 0.9,
        vocabularyDiversity: 0.2,
        disagreementCount: 0,
        novelIdeaCount: 0,
        crossPollinationCount: 0,
        exchangeRate: 4,
      })
    );
    expect(reading.energy).toBe(0.8);
    expect(reading.convergence).toBe(0.9);
    expect(reading.diversity).toBe(0.2);
    expect(reading.disagreement).toBe(0);
    expect(reading.exchange).toBeCloseTo(0.2, 9);
  });
});

// ──────────────────────────────────────────────
// Integration — the full chain: flow → pulse → perception → drives
// ──────────────────────────────────────────────

describe("Integration — the engine's agents think in pulses", () => {
  it("a cold room over pulses: the agent perceives, hungers, and force-seeks without acting", () => {
    // The room cools across the evening — energy drains, convergence
    // locks in, and the fall itself accelerates (rate < 0).
    const flows = [
      makeFlow({ energyLevel: 0.8, convergenceScore: 0.4, vocabularyDiversity: 0.7, novelIdeaCount: 5 }),
      makeFlow({ energyLevel: 0.6, convergenceScore: 0.55, vocabularyDiversity: 0.6, novelIdeaCount: 3 }),
      makeFlow({ energyLevel: 0.35, convergenceScore: 0.7, vocabularyDiversity: 0.45, novelIdeaCount: 2 }),
      makeFlow({ energyLevel: 0.1, convergenceScore: 0.85, vocabularyDiversity: 0.3, novelIdeaCount: 0 }),
    ];

    let i = 0;
    const loop = new PulseLoop("night-watch", () => flowToReading(flows[Math.min(i, flows.length - 1)]), {
      period: 5,
    });
    const mod = new DriveModulator();

    let report: PerceptionReport | null = null;
    for (let t = 0; t < 4; t++) {
      report = loop.tick(t * 5);
      mod.modulate(
        new PerceptionCheck(loop.lastReadings(), {
          warmthDials: ["energy", "diversity", "novelty"],
        })
      );
      i++;
    }

    // The agent never acted — but it was sensing the whole time.
    expect(report!.agentSaid).toBe(false);
    expect(report!.traffic).toBe(0);
    const monologue = loop.internalMonologue();
    expect(monologue).toContain("I haven't said a word");

    // The macro read: the room cooled.
    expect(report!.warmthDirection).toBeLessThan(0);
    expect(report!.warmthRate).toBeLessThan(0);

    // The drives responded to the room.
    const drives = mod.state();
    expect(drives.hunger).toBeGreaterThan(0);
    expect(drives.forceSeek).toBe(true);
  });

  it("a warm, lively room keeps the agent calm through the pulses", () => {
    // A steady warm room — energy high, novelty flowing, nothing dipping.
    const flows = [
      makeFlow({ energyLevel: 0.72, convergenceScore: 0.3, vocabularyDiversity: 0.72, novelIdeaCount: 3 }),
      makeFlow({ energyLevel: 0.72, convergenceScore: 0.3, vocabularyDiversity: 0.72, novelIdeaCount: 3 }),
      makeFlow({ energyLevel: 0.72, convergenceScore: 0.3, vocabularyDiversity: 0.72, novelIdeaCount: 3 }),
    ];

    let i = 0;
    const loop = new PulseLoop("warm-watcher", () => flowToReading(flows[Math.min(i, flows.length - 1)]), {
      period: 5,
    });
    const mod = new DriveModulator();

    for (let t = 0; t < 3; t++) {
      loop.tick(t * 5);
      mod.modulate(
        new PerceptionCheck(loop.lastReadings(), {
          warmthDials: ["energy", "diversity", "novelty"],
        })
      );
      i++;
    }

    const drives = mod.state();
    expect(drives.hunger).toBe(0);
    expect(drives.stagnation).toBe(0);
    expect(drives.forceSeek).toBe(false);
    expect(loop.internalMonologue()).toContain("the room is");
  });
});
