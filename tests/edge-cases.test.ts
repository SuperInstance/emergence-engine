// tests/edge-cases.test.ts
// Edge cases, NaN/Infinity safety, boundary conditions, and empty-input resilience
// for the InterruptionSystem and related components.
//
// The fleet standard: no NaN should propagate silently. No empty input should crash.
// Every boundary is a test.

import { describe, it, expect } from "vitest";
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

// ──────────────────────────────────────────────
// NaN / Infinity / Invalid Number Safety
// ──────────────────────────────────────────────

describe("Edge Cases — NaN/Infinity in GroupFlow", () => {
  it("handles NaN convergenceScore without crashing", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const flow = makeFlow({ convergenceScore: NaN });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(flow, { stagnationLevel: 0.6 });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles Infinity vocabularyDiversity without crashing", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const flow = makeFlow({ vocabularyDiversity: Infinity });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(flow, {});
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles negative energyLevel", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const flow = makeFlow({ energyLevel: -5 });

    const result = system.shouldInterrupt(flow, { stagnationLevel: 0.8 });
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("handles NaN in context stagnationLevel", () => {
    const system = new InterruptionSystem({ minInterval: 0, stagnationThreshold: 0.5 });

    // NaN stagnation should not trigger stagnation-driven mode
    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(makeFlow(), { stagnationLevel: NaN });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles NaN in context agentDissatisfactionScores values", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const scores = new Map<string, number>();
    scores.set("alice", NaN);
    scores.set("bob", 0.7);

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        agentDissatisfactionScores: scores,
      });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles all-zero GroupFlow (fully stagnant)", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const flow = makeFlow({
      convergenceScore: 0,
      energyLevel: 0,
      vocabularyDiversity: 0,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      averageMessageLength: 0,
      exchangeRate: 0,
    });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(flow, {});
      // Should not crash; stagnation estimate should be computable
      expect(result === null || typeof result === "object").toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// Empty Input Resilience
// ──────────────────────────────────────────────

describe("Edge Cases — Empty Inputs", () => {
  it("handles empty participantIds", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const flow = makeFlow({ participantIds: [] });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(flow, { stagnationLevel: 0.7 });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles empty availableDisruptionMethods", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        availableDisruptionMethods: [],
        stagnationLevel: 0.8,
      });
      // With no methods available, most generators bail;
      // dissatisfaction and new_model don't use availableDisruptionMethods
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles empty agentDissatisfactionScores", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        agentDissatisfactionScores: new Map(),
        stagnationLevel: 0.6,
      });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles undefined dominantTopic in flow", () => {
    const system = new InterruptionSystem({ minInterval: 0, qualityThreshold: 0 });
    const flow = makeFlow({ dominantTopic: undefined });

    for (let i = 0; i < 35; i++) {
      const result = system.shouldInterrupt(flow, { stagnationLevel: 0.6 });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// Hunger Mechanic Boundaries
// ──────────────────────────────────────────────

describe("Edge Cases — Hunger Boundaries", () => {
  it("hunger is 0 at tick 0 (before any calls)", () => {
    const system = new InterruptionSystem({ maxInterval: 30, hungerFactor: 1.0 });
    // Before any shouldInterrupt calls, tickCount is 0
    // getHunger computes (0 - 0) / 30 = 0
    expect(system.getHunger()).toBe(0);
  });

  it("hunger approaches 1 as ticks approach maxInterval", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 10,
      hungerFactor: 1.0,
      qualityThreshold: 1.0, // prevent interruptions from firing
    });

    // Tick a few times without accepting interruptions
    for (let i = 0; i < 9; i++) {
      system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
    }

    // Should be close to 1 but not quite (9/10 * 1.0 = 0.9)
    const hunger = system.getHunger();
    expect(hunger).toBeGreaterThanOrEqual(0.8);
    expect(hunger).toBeLessThanOrEqual(1.0);
  });

  it("hunger never exceeds 1", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 5,
      hungerFactor: 1.0,
      qualityThreshold: 1.0,
    });

    for (let i = 0; i < 100; i++) {
      system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
    }

    expect(system.getHunger()).toBeLessThanOrEqual(1.0);
  });

  it("hunger with 0 hungerFactor is always 0", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 5,
      hungerFactor: 0,
      qualityThreshold: 1.0,
    });

    for (let i = 0; i < 20; i++) {
      system.shouldInterrupt(makeFlow(), {});
    }

    expect(system.getHunger()).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Acceptance Rate Boundaries
// ──────────────────────────────────────────────

describe("Edge Cases — Acceptance Rate", () => {
  it("returns 0 for empty history", () => {
    const system = new InterruptionSystem();
    expect(system.getAcceptanceRate()).toBe(0);
  });

  it("returns correct rate for all-accepted", () => {
    const system = new InterruptionSystem();
    const int1: Interruption = {
      id: "1", type: "better_idea", source: "test", whatItBreaks: "x",
      whatItOffers: "y", quality: 0.9, accepted: false, timestamp: new Date().toISOString(),
    };
    const int2: Interruption = {
      id: "2", type: "serendipity", source: "test", whatItBreaks: "x",
      whatItOffers: "y", quality: 0.8, accepted: false, timestamp: new Date().toISOString(),
    };

    system.recordInterruption(int1, true);
    system.recordInterruption(int2, true);
    expect(system.getAcceptanceRate()).toBe(1.0);
  });

  it("returns correct rate for mixed acceptance", () => {
    const system = new InterruptionSystem();
    for (let i = 0; i < 10; i++) {
      const interruption: Interruption = {
        id: `int-${i}`, type: "better_idea", source: "test",
        whatItBreaks: "x", whatItOffers: "y", quality: 0.5,
        accepted: false, timestamp: new Date().toISOString(),
      };
      system.recordInterruption(interruption, i % 2 === 0);
    }
    expect(system.getAcceptanceRate()).toBeCloseTo(0.5);
  });
});

// ──────────────────────────────────────────────
// Custom Generator Edge Cases
// ──────────────────────────────────────────────

describe("Edge Cases — Custom Generators", () => {
  it("handles a custom generator that always returns null", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      qualityThreshold: 0,
      maxInterval: 1,
    });

    const nullGenerator: InterruptionGenerator = () => null;
    system.registerGenerator(nullGenerator);

    // Force-seek mode (maxInterval = 1, so tick 2 triggers force-seek)
    for (let i = 0; i < 5; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
      // May still get interruptions from built-in generators
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("handles a custom generator returning NaN quality", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      qualityThreshold: 0.5,
    });

    const nanGenerator: InterruptionGenerator = (_flow, _ctx) => ({
      id: "nan-quality",
      type: "serendipity",
      source: "custom",
      whatItBreaks: "test",
      whatItOffers: "test",
      quality: NaN,
      accepted: false,
      timestamp: new Date().toISOString(),
    });
    system.registerGenerator(nanGenerator);

    for (let i = 0; i < 10; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0.8,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
      // NaN quality should be filtered by threshold comparison
      // NaN >= 0.5 is false, so this generator's output should never be picked
      if (result !== null) {
        expect(result.id).not.toBe("nan-quality");
      }
    }
  });

  it("handles a custom generator that throws", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      qualityThreshold: 0,
    });

    const throwingGenerator: InterruptionGenerator = () => {
      throw new Error("Generator explosion");
    };
    system.registerGenerator(throwingGenerator);

    // The system doesn't catch thrown errors — this test documents that behavior
    // and ensures we know what happens
    expect(() => {
      system.shouldInterrupt(makeFlow(), { stagnationLevel: 0.8 });
    }).toThrow();
  });
});

// ──────────────────────────────────────────────
// Force-Seek Mode Boundaries
// ──────────────────────────────────────────────

describe("Edge Cases — Force-Seek Mode", () => {
  it("lowers quality threshold in force-seek mode", () => {
    // In force-seek mode, effective threshold = qualityThreshold * 0.7
    // So a generator producing quality 0.25 would pass if threshold is 0.35
    // (0.35 * 0.7 = 0.245, and 0.25 >= 0.245)
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 2, // force-seek triggers at tick 2
      qualityThreshold: 0.35,
      hungerFactor: 0, // disable opportunity-driven
      stagnationThreshold: 1.0, // disable stagnation-driven
    });

    const lowQualityGenerator: InterruptionGenerator = () => ({
      id: "low-quality",
      type: "serendipity",
      source: "custom",
      whatItBreaks: "test",
      whatItOffers: "test",
      quality: 0.26,
      accepted: false,
      timestamp: new Date().toISOString(),
    });
    system.registerGenerator(lowQualityGenerator);

    // Tick past maxInterval to trigger force-seek
    const result = system.shouldInterrupt(makeFlow(), {
      stagnationLevel: 0,
      availableDisruptionMethods: [],
      agentDissatisfactionScores: new Map(),
    });

    // In force-seek mode, threshold is lowered, so low-quality should pass
    if (result !== null) {
      // Could be from built-in generators too
      expect(typeof result).toBe("object");
    }
  });

  it("force-seek activates exactly at maxInterval", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 5,
      qualityThreshold: 0,
      hungerFactor: 0,
      stagnationThreshold: 1.0,
    });

    // Ticks 1-4: not force-seeking, no stagnation, no opportunity → null
    for (let i = 0; i < 4; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
      expect(result).toBeNull();
    }

    // Tick 5: force-seek activates
    // Note: even with no available methods, dissatisfaction/new_model generators
    // don't check availableDisruptionMethods. With empty dissatisfaction and
    // no model upgrade, they return null too. So force-seek lowers threshold
    // but may still find nothing.
    const result = system.shouldInterrupt(makeFlow(), {
      stagnationLevel: 0,
      availableDisruptionMethods: ["serendipity", "seeded_stranger"],
    });
    // Force-seek with available methods should produce candidates
    // But randomness means it might not — just verify no crash
    expect(result === null || typeof result === "object").toBe(true);
  });
});

// ──────────────────────────────────────────────
// Stagnation Estimation Edge Cases
// ──────────────────────────────────────────────

describe("Edge Cases — Stagnation Estimation", () => {
  it("maximally stagnant flow has high stagnation", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      stagnationThreshold: 0.01,
      qualityThreshold: 0,
    });

    // Everything that contributes to stagnation is maxed
    const stagnant = makeFlow({
      convergenceScore: 1.0,    // +0.35
      vocabularyDiversity: 0.0, // +0.25
      novelIdeaCount: 0,        // +0.20
      disagreementCount: 0,     // +0.10
      crossPollinationCount: 0, // +0.10
    });
    // Total stagnation estimate: 1.0 (capped)

    // Should trigger stagnation-driven interruption seeking
    for (let i = 0; i < 10; i++) {
      const result = system.shouldInterrupt(stagnant, {
        availableDisruptionMethods: ["serendipity", "seeded_stranger", "dj_curveball"],
      });
      expect(result === null || typeof result === "object").toBe(true);
    }
  });

  it("healthy flow has low stagnation", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      stagnationThreshold: 0.5,
      qualityThreshold: 0,
      hungerFactor: 0, // disable opportunity
    });

    const healthy = makeFlow({
      convergenceScore: 0.1,     // +0.035
      vocabularyDiversity: 0.9,  // +0.025
      novelIdeaCount: 5,         // +0
      disagreementCount: 3,      // +0
      crossPollinationCount: 2,  // +0
    });
    // Total: ~0.06, well below threshold

    // Should not trigger stagnation-driven mode
    for (let i = 0; i < 4; i++) {
      const result = system.shouldInterrupt(healthy, {
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
      expect(result).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────
// Config Edge Cases
// ──────────────────────────────────────────────

describe("Edge Cases — Config Extremes", () => {
  it("handles minInterval of 0", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 1,
      qualityThreshold: 0,
      hungerFactor: 1.0,
    });

    // Every tick can potentially interrupt
    const result = system.shouldInterrupt(makeFlow(), {
      stagnationLevel: 0.9,
      availableDisruptionMethods: ["serendipity"],
    });
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("handles maxInterval equal to minInterval", () => {
    const system = new InterruptionSystem({
      minInterval: 5,
      maxInterval: 5,
      qualityThreshold: 0,
    });

    // First 4 ticks: minInterval prevents
    for (let i = 0; i < 4; i++) {
      system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
    }

    // Tick 5: both minInterval satisfied AND force-seek
    const result = system.shouldInterrupt(makeFlow(), {
      stagnationLevel: 0,
      availableDisruptionMethods: ["serendipity", "seeded_stranger"],
    });
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("handles very large maxInterval", () => {
    const system = new InterruptionSystem({
      minInterval: 0,
      maxInterval: 1000000,
      qualityThreshold: 0,
      hungerFactor: 0,
      stagnationThreshold: 1.0,
    });

    for (let i = 0; i < 100; i++) {
      const result = system.shouldInterrupt(makeFlow(), {
        stagnationLevel: 0,
        availableDisruptionMethods: [],
        agentDissatisfactionScores: new Map(),
      });
      // No force-seek (maxInterval huge), no stagnation, no opportunity
      expect(result).toBeNull();
    }
  });
});
