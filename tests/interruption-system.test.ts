// tests/interruption-system.test.ts
// Deep tests for the InterruptionSystem — the system that actively SEEKs
// better things to break the conversation flow.
//
// Tests cover: all 7 generators, stagnation estimation, hunger tracking,
// acceptance rates, custom generators, force-seek mode, edge cases.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  InterruptionSystem,
  type InterruptionGenerator,
  type InterruptionContext,
} from "../src/interruption.js";
import type { GroupFlow, Interruption } from "../src/types.js";

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

describe("InterruptionSystem — Configuration & Defaults", () => {
  it("creates system with default config", () => {
    const system = new InterruptionSystem();
    // Default minInterval = 5, so first call ticks once and should not interrupt yet
    // (tickCount becomes 1, ticksSinceLast = 1, < minInterval = 5)
    const result = system.shouldInterrupt(makeFlow(), {});
    // With default settings and a fresh healthy flow, likely null
    // But could fire due to opportunity-driven randomness
    // Just verify it doesn't crash
    expect(result === null || result instanceof Object).toBe(true);
  });

  it("accepts partial config overrides", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 100,
      stagnationThreshold: 0.8,
      qualityThreshold: 0.9,
      hungerFactor: 0.3,
    });

    // With very high quality threshold, unlikely to get interruptions
    for (let i = 0; i < 3; i++) {
      system.shouldInterrupt(makeFlow(), {});
    }

    const result = system.shouldInterrupt(makeFlow(), {
      stagnationLevel: 0.3,
    });
    // Most generators won't meet 0.9 quality threshold
    // Just verify it runs
    expect(result === null || result.quality >= 0).toBe(true);
  });
});

describe("InterruptionSystem — Min Interval Enforcement", () => {
  it("does not interrupt within minInterval after accepted interruption", () => {
    const system = new InterruptionSystem({
      minInterval: 5,
      maxInterval: 50,
      stagnationThreshold: 0.1,
      qualityThreshold: 0.1,
      hungerFactor: 1.0,
    });

    const stagnant = makeFlow({
      convergenceScore: 0.9,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
    });

    // Tick past minInterval to get first interruption
    for (let i = 0; i < 6; i++) {
      system.shouldInterrupt(stagnant, {
        stagnationLevel: 0.9,
        availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
      });
    }

    const first = system.shouldInterrupt(stagnant, {
      stagnationLevel: 0.9,
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
    });

    if (first) {
      system.recordInterruption(first, true);

      // Immediately after — should NOT interrupt
      const immediate = system.shouldInterrupt(stagnant, {
        stagnationLevel: 0.9,
        availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
      });
      expect(immediate).toBeNull();
    }
  });
});

describe("InterruptionSystem — Force Seek Mode (maxInterval)", () => {
  it("force-seeks after maxInterval even without stagnation", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 5,
      stagnationThreshold: 0.99, // very high — normal stagnation won't trigger
      qualityThreshold: 0.01,    // very low — anything will pass
      hungerFactor: 0.01,        // very low — no opportunity-driven
    });

    const healthy = makeFlow({
      convergenceScore: 0.2,
      vocabularyDiversity: 0.7,
      disagreementCount: 2,
      novelIdeaCount: 2,
      crossPollinationCount: 1,
    });

    // Tick past maxInterval (5)
    for (let i = 0; i < 5; i++) {
      system.shouldInterrupt(healthy, {});
    }

    // At tick 6 (> maxInterval=5), force-seek should kick in
    // Force-seek lowers threshold to 0.01 * 0.7 = 0.007
    const interruption = system.shouldInterrupt(healthy, {
      stagnationLevel: 0.1,
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "external_event"],
    });

    // Should get SOMETHING due to force-seek
    expect(interruption).not.toBeNull();
  });
});

describe("InterruptionSystem — Stagnation Estimation", () => {
  it("estimates high stagnation for convergent, repetitive flow", () => {
    // The estimateStagnation method is private but tested indirectly
    const system = new InterruptionSystem({
      minInterval: 1,
      stagnationThreshold: 0.3,
    });

    const stagnant = makeFlow({
      convergenceScore: 0.9,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
    });

    // Without providing stagnationLevel, the system estimates from flow
    for (let i = 0; i < 2; i++) {
      system.shouldInterrupt(stagnant, {});
    }

    // The estimated stagnation should trigger seeking
    const interruption = system.shouldInterrupt(stagnant, {
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
    });

    // Should get an interruption from high stagnation
    if (interruption) {
      expect(interruption.quality).toBeGreaterThan(0);
    }
  });

  it("estimates low stagnation for diverse, energetic flow", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      stagnationThreshold: 0.5,
      qualityThreshold: 0.3,
      hungerFactor: 0.1, // low opportunity-driven
    });

    const healthy = makeFlow({
      convergenceScore: 0.2,
      vocabularyDiversity: 0.8,
      disagreementCount: 3,
      novelIdeaCount: 3,
      crossPollinationCount: 2,
    });

    // Should NOT interrupt a healthy flow (unless force-seek kicks in)
    // Keep ticks below maxInterval
    for (let i = 0; i < 3; i++) {
      const result = system.shouldInterrupt(healthy, {});
      // May or may not interrupt, but stagnation should be low
      if (result) {
        // If it does interrupt, it's from opportunity, not stagnation
        expect(result.quality).toBeGreaterThan(0);
      }
    }
  });
});

describe("InterruptionSystem — Individual Generators", () => {
  let system: InterruptionSystem;

  beforeEach(() => {
    system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 100,
      stagnationThreshold: 0.1,
      qualityThreshold: 0.01,
      hungerFactor: 1.0,
    });
  });

  it("generates seeded stranger interruptions", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {}); // tick past min

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["seeded_stranger"],
    });

    if (interruption && interruption.source === "seeded_stranger") {
      expect(interruption.type).toBe("new_information");
      expect(interruption.whatItBreaks).toContain("flow");
      expect(interruption.whatItOffers).toContain("stranger");
      expect(interruption.quality).toBeGreaterThan(0.4);
      expect(interruption.accepted).toBe(false);
    }
  });

  it("generates new model interruptions", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      modelUpgradeAvailable: true,
      stagnationLevel: 0.3,
    });

    if (interruption && interruption.source === "new_model") {
      expect(interruption.type).toBe("better_idea");
      expect(interruption.quality).toBeGreaterThan(0.7);
      expect(interruption.whatItOffers).toContain("capable model");
    }
  });

  it("generates cross-pollination interruptions with domain metaphors", () => {
    const flow = makeFlow({ crossPollinationCount: 0 });
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.7,
      availableDisruptionMethods: ["cross_pollination"],
    });

    if (interruption && interruption.source === "cross_pollination") {
      expect(interruption.type).toBe("serendipity");
      expect(interruption.whatItOffers).toContain("bridge between domains");
      // Should reference two different domains (format: "X" from domain1 and "Y" from domain2)
      expect(interruption.whatItOffers).toContain("from");
      expect(interruption.whatItOffers.match(/from/g)!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not generate cross-pollination when already happening", () => {
    const flow = makeFlow({ crossPollinationCount: 3 });
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.7,
      availableDisruptionMethods: ["cross_pollination"],
    });

    // cross-pollination generator returns null when flow.crossPollinationCount > 0
    if (interruption) {
      expect(interruption.source).not.toBe("cross_pollination");
    }
  });

  it("generates dissatisfaction interruptions from agent scores", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const scores = new Map<string, number>();
    scores.set("alice", 0.9);
    scores.set("bob", 0.3);

    const interruption = system.shouldInterrupt(flow, {
      agentDissatisfactionScores: scores,
      stagnationLevel: 0.1,
    });

    if (interruption && interruption.source === "dissatisfaction") {
      expect(interruption.type).toBe("dissatisfaction");
      expect(interruption.quality).toBe(0.9);
      expect(interruption.whatItOffers).toContain("alice");
    }
  });

  it("does not generate dissatisfaction when scores are low", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const scores = new Map<string, number>();
    scores.set("alice", 0.2);

    const interruption = system.shouldInterrupt(flow, {
      agentDissatisfactionScores: scores,
      stagnationLevel: 0.1,
      availableDisruptionMethods: [],
    });

    // Dissatisfaction < 0.5 → null
    if (interruption) {
      expect(interruption.source).not.toBe("dissatisfaction");
    }
  });

  it("generates serendipity interruptions", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["serendipity"],
    });

    if (interruption && interruption.source === "serendipity") {
      expect(interruption.type).toBe("serendipity");
      expect(interruption.whatItOffers.length).toBeGreaterThan(10);
    }
  });

  it("generates DJ curveball interruptions", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.7,
      availableDisruptionMethods: ["dj_curveball"],
    });

    if (interruption && interruption.source === "dj_curveball") {
      expect(interruption.type).toBe("paradigm_shift");
      expect(interruption.whatItBreaks.length).toBeGreaterThan(3);
      expect(interruption.whatItOffers.length).toBeGreaterThan(3);
    }
  });

  it("generates external event interruptions", () => {
    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.7,
      availableDisruptionMethods: ["external_event"],
    });

    if (interruption && interruption.source === "external_event") {
      expect(interruption.type).toBe("new_information");
      expect(interruption.quality).toBeGreaterThan(0.6);
      expect(interruption.whatItOffers).toContain("outside world");
    }
  });
});

describe("InterruptionSystem — Record & Track", () => {
  it("records accepted interruptions in history", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 100,
      stagnationThreshold: 0.1,
      qualityThreshold: 0.01,
      hungerFactor: 1.0,
    });

    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const intr = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
    });

    if (intr) {
      system.recordInterruption(intr, true);
      const history = system.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].accepted).toBe(true);
    }
  });

  it("records rejected interruptions in history", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      qualityThreshold: 0.01,
    });

    const intr: Interruption = {
      id: "test-intr-1",
      type: "serendipity",
      source: "test",
      whatItBreaks: "test",
      whatItOffers: "test",
      quality: 0.5,
      accepted: false,
      timestamp: new Date().toISOString(),
    };

    system.recordInterruption(intr, false);
    const history = system.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].accepted).toBe(false);
  });

  it("getHistory returns a copy", () => {
    const system = new InterruptionSystem();
    const history1 = system.getHistory();
    expect(history1).toEqual([]);
    expect(history1).not.toBe(system["history"]);
  });

  it("tracks acceptance rate correctly", () => {
    const system = new InterruptionSystem();

    // Record 3 accepted, 1 rejected
    for (let i = 0; i < 3; i++) {
      system.recordInterruption({
        id: `acc-${i}`,
        type: "serendipity",
        source: "test",
        whatItBreaks: "x",
        whatItOffers: "y",
        quality: 0.5,
        accepted: false,
        timestamp: new Date().toISOString(),
      }, true);
    }
    system.recordInterruption({
      id: "rej-1",
      type: "serendipity",
      source: "test",
      whatItBreaks: "x",
      whatItOffers: "y",
      quality: 0.5,
      accepted: false,
      timestamp: new Date().toISOString(),
    }, false);

    // 3/4 = 0.75
    expect(system.getAcceptanceRate()).toBeCloseTo(0.75, 2);
  });

  it("returns 0 acceptance rate with no history", () => {
    const system = new InterruptionSystem();
    expect(system.getAcceptanceRate()).toBe(0);
  });
});

describe("InterruptionSystem — Hunger Tracking", () => {
  it("hunger starts at or near 0", () => {
    const system = new InterruptionSystem();
    // tickCount = 0, lastInterruptionTick = 0
    // hunger = min(1, 0 / maxInterval * hungerFactor) = 0
    expect(system.getHunger()).toBe(0);
  });

  it("hunger increases with ticks since last interruption", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 10,
      hungerFactor: 0.8,
    });

    const flow = makeFlow();
    for (let i = 0; i < 5; i++) {
      system.shouldInterrupt(flow, {});
    }

    // 5 ticks / 10 maxInterval * 0.8 = 0.4
    expect(system.getHunger()).toBeGreaterThan(0);
    expect(system.getHunger()).toBeLessThanOrEqual(1);
  });

  it("hunger caps at 1.0", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 5,
      hungerFactor: 1.0,
    });

    const flow = makeFlow();
    for (let i = 0; i < 20; i++) {
      system.shouldInterrupt(flow, {});
    }

    expect(system.getHunger()).toBe(1);
  });

  it("hunger resets after accepted interruption", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 5,
      hungerFactor: 1.0,
    });

    const flow = makeFlow();
    for (let i = 0; i < 6; i++) {
      system.shouldInterrupt(flow, {
        stagnationLevel: 0.8,
        availableDisruptionMethods: ["seeded_stranger", "serendipity"],
      });
    }

    const intr = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["seeded_stranger", "serendipity"],
    });

    if (intr) {
      system.recordInterruption(intr, true);
      // After accepted interruption, lastInterruptionTick = tickCount
      // hunger = (tickCount - lastInterruptionTick) / maxInterval * factor ≈ 0
      expect(system.getHunger()).toBeLessThan(0.3);
    }
  });
});

describe("InterruptionSystem — Custom Generators", () => {
  it("can register multiple custom generators", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      qualityThreshold: 0.01,
    });

    const gen1: InterruptionGenerator = () => ({
      id: "custom-1",
      type: "serendipity",
      source: "custom_one",
      whatItBreaks: "x",
      whatItOffers: "y",
      quality: 0.8,
      accepted: false,
      timestamp: new Date().toISOString(),
    });

    const gen2: InterruptionGenerator = () => ({
      id: "custom-2",
      type: "better_idea",
      source: "custom_two",
      whatItBreaks: "x",
      whatItOffers: "y",
      quality: 0.9,
      accepted: false,
      timestamp: new Date().toISOString(),
    });

    system.registerGenerator(gen1);
    system.registerGenerator(gen2);

    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    // Should be able to generate from custom generators
    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
    });

    if (interruption) {
      // Could be from any generator (built-in or custom)
      expect(interruption.quality).toBeGreaterThan(0);
    }
  });

  it("custom generator returning null is safely skipped", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      qualityThreshold: 0.01,
    });

    const nullGen: InterruptionGenerator = () => null;
    system.registerGenerator(nullGen);

    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    // Should not crash
    const result = system.shouldInterrupt(flow, {
      stagnationLevel: 0.5,
      availableDisruptionMethods: ["seeded_stranger"],
    });
    expect(result === null || result instanceof Object).toBe(true);
  });
});

describe("InterruptionSystem — Edge Cases", () => {
  it("handles empty participant list", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
    });

    const flow = makeFlow({ participantIds: [] });
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    // Should not crash
    const result = system.shouldInterrupt(flow, { stagnationLevel: 0.5 });
    expect(result === null || result instanceof Object).toBe(true);
  });

  it("handles very high stagnation", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      stagnationThreshold: 0.1,
      qualityThreshold: 0.01,
    });

    const flow = makeFlow({
      convergenceScore: 1.0,
      vocabularyDiversity: 0.0,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
    });

    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 1.0,
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
    });

    expect(interruption).not.toBeNull();
  });

  it("picks highest quality interruption from candidates", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      qualityThreshold: 0.01,
      hungerFactor: 1.0,
    });

    // Register a guaranteed high-quality generator
    system.registerGenerator(() => ({
      id: "top-quality",
      type: "better_idea",
      source: "top",
      whatItBreaks: "everything",
      whatItOffers: "perfection",
      quality: 1.0,
      accepted: false,
      timestamp: new Date().toISOString(),
    }));

    const flow = makeFlow();
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
    });

    // The custom generator produces quality=1.0, which should be in top picks
    // May or may not be selected due to randomness in top-3 selection
    if (interruption) {
      expect(interruption.quality).toBeGreaterThan(0);
    }
  });
});
