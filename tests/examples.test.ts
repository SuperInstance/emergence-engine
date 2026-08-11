// tests/examples.test.ts
// Verify the example scenarios produce expected emergence patterns

import { describe, it, expect } from "vitest";
import { EmergenceDetector } from "../src/emergence-detector.js";
import { GroupthinkMonitor } from "../src/groupthink.js";
import { InterruptionSystem } from "../src/interruption.js";
import { RevelationTracker, createRevelation } from "../src/revelation.js";
import type { GroupEvent, GroupFlow } from "../src/types.js";

describe("Example: Basic Emergence Scenario", () => {
  const events: GroupEvent[] = [
    {
      id: "e1",
      timestamp: "2026-08-11T10:00:00Z",
      agentId: "wesley",
      displayName: "Wesley",
      content: "The depth sensor keeps returning weird values at night when the fish are active.",
      type: "message",
    },
    {
      id: "e2",
      timestamp: "2026-08-11T10:01:00Z",
      agentId: "riker",
      displayName: "Riker",
      content: "Weird how? Like noise, or like a pattern in the noise that means something?",
      type: "message",
      metadata: { replyTo: "e1" },
    },
    {
      id: "e3",
      timestamp: "2026-08-11T10:02:00Z",
      agentId: "wesley",
      displayName: "Wesley",
      content: "A pattern. Like the fish are singing at a frequency the depth sensor picks up.",
      type: "message",
      metadata: { replyTo: "e2" },
    },
    {
      id: "e4",
      timestamp: "2026-08-11T10:03:00Z",
      agentId: "hermes",
      displayName: "Hermes",
      content: "Wait— that's it. The sensor isn't broken. It's a hydrophone picking up life.",
      type: "message",
      metadata: { replyTo: "e3" },
    },
    {
      id: "e5",
      timestamp: "2026-08-11T10:04:00Z",
      agentId: "hermes",
      displayName: "Hermes",
      content: "Oh, I see now. The depth readings are entangled with the bioluminescence cycle. The fish ARE the sensor.",
      type: "message",
      metadata: { replyTo: "e3" },
    },
  ];

  it("should detect at least one emergent pattern in a rich conversation", () => {
    const detector = new EmergenceDetector({
      observationWindow: 10,
      minParticipants: 2,
      unpredictabilityThreshold: 0.3,
      stagnationInterval: 8,
    });

    const patterns: string[] = [];
    for (const event of events) {
      const pattern = detector.observe(event);
      if (pattern) patterns.push(pattern.type);
    }

    expect(patterns.length).toBeGreaterThan(0);
  });

  it("should classify conversation texture", () => {
    const detector = new EmergenceDetector();
    for (const event of events) {
      detector.observe(event);
    }

    const phase = detector.getCurrentPhase();
    expect(typeof phase).toBe("string");
    expect(phase.length).toBeGreaterThan(0);
  });

  it("should produce a flow assessment with all fields populated", () => {
    const detector = new EmergenceDetector();
    for (const event of events) {
      detector.observe(event);
    }

    const flow = detector.assessFlow();
    expect(flow.participantIds.length).toBeGreaterThan(0);
    expect(flow.convergenceScore).toBeGreaterThanOrEqual(0);
    expect(flow.convergenceScore).toBeLessThanOrEqual(1);
    expect(flow.vocabularyDiversity).toBeGreaterThan(0);
    expect(flow.averageMessageLength).toBeGreaterThan(0);
  });
});

describe("Example: Groupthink Monitor", () => {
  it("should detect destructive groupthink in agreement-heavy flow", () => {
    const monitor = new GroupthinkMonitor();

    // GroupthinkMonitor.assess takes a GroupFlow, not raw events
    const stagnantFlow: GroupFlow = {
      events: [],
      participantIds: ["a", "b", "c"],
      startTime: "2026-08-11T10:00:00Z",
      endTime: "2026-08-11T10:10:00Z",
      convergenceScore: 0.92,
      energyLevel: 0.4,
      vocabularyDiversity: 0.15,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      averageMessageLength: 38,
      exchangeRate: 10,
    };

    const assessment = monitor.assess(stagnantFlow);
    expect(assessment.quality).not.toBe("productive");
  });

  it("should detect productive groupthink in diverse conversation", () => {
    const monitor = new GroupthinkMonitor();

    const diverseFlow: GroupFlow = {
      events: [],
      participantIds: ["a1", "a2", "a3"],
      startTime: "2026-08-11T10:00:00Z",
      endTime: "2026-08-11T10:03:00Z",
      convergenceScore: 0.3,
      energyLevel: 0.8,
      vocabularyDiversity: 0.75,
      disagreementCount: 2,
      novelIdeaCount: 3,
      crossPollinationCount: 2,
      averageMessageLength: 120,
      exchangeRate: 4,
    };

    const assessment = monitor.assess(diverseFlow);
    expect(assessment.disagreementFrequency).toBeGreaterThan(0);
  });
});

describe("Example: Interruption System", () => {
  it("should recommend interruption when stagnant", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 5,
      stagnationThreshold: 0.3,
      qualityThreshold: 0.2,
      hungerFactor: 0.9,
    });

    const stagnantFlow: GroupFlow = {
      events: [],
      participantIds: ["a", "b"],
      startTime: "2026-08-11T10:00:00Z",
      endTime: "2026-08-11T10:10:00Z",
      convergenceScore: 0.95,
      energyLevel: 0.3,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      averageMessageLength: 25,
      exchangeRate: 10,
    };

    // shouldInterrupt is the main entry point
    // With high stagnation, it should generate interruptions
    let foundInterruption = false;
    for (let i = 0; i < 10; i++) {
      const interruption = system.shouldInterrupt(stagnantFlow, {
        availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity", "cross_pollination", "external_event"],
        stagnationLevel: 0.85,
        agentDissatisfactionScores: new Map([["a", 0.7], ["b", 0.3]]),
        recentTopics: ["agreement"],
        modelUpgradeAvailable: false,
      });
      if (interruption) {
        foundInterruption = true;
        expect(interruption.quality).toBeGreaterThanOrEqual(0.2);
        break;
      }
    }
    expect(foundInterruption).toBe(true);
  });

  it("should grow hunger over time via getHunger", () => {
    const system = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 5,
      stagnationThreshold: 0.5,
      qualityThreshold: 0.3,
      hungerFactor: 0.8,
    });

    // Initially hunger is low (no ticks yet)
    const initialHunger = system.getHunger();

    // Tick the system by calling shouldInterrupt multiple times
    const flow: GroupFlow = {
      events: [],
      participantIds: ["a"],
      startTime: "2026-08-11T10:00:00Z",
      endTime: "2026-08-11T10:01:00Z",
      convergenceScore: 0.5,
      energyLevel: 0.5,
      vocabularyDiversity: 0.5,
      disagreementCount: 1,
      novelIdeaCount: 1,
      crossPollinationCount: 1,
      averageMessageLength: 50,
      exchangeRate: 5,
    };

    for (let i = 0; i < 8; i++) {
      system.shouldInterrupt(flow, {});
    }
    const finalHunger = system.getHunger();
    expect(finalHunger).toBeGreaterThanOrEqual(initialHunger);
  });

  it("should track acceptance rate", () => {
    const system = new InterruptionSystem();
    expect(system.getAcceptanceRate()).toBe(0);
    expect(system.getHistory().length).toBe(0);
  });
});

describe("Example: Revelation Chain", () => {
  it("should build a chain of iterative insights", () => {
    const tracker = new RevelationTracker();

    // createRevelation takes positional args:
    // (agentId, insight, nextLayer, openness, previousRevelationId?, participants?)
    const r1 = createRevelation(
      "flash",
      "A poker bluff is a tile that mimics cortex output.",
      "What does the CALL on a bluff look like?",
      0.8
    );

    const r2 = createRevelation(
      "pro",
      "The CALL on a bluff is a tile that holds uncertainty in its deadband.",
      "What is a door that doesn't know it's a bridge?",
      0.85,
      r1.id
    );

    // RevelationTracker uses record(), not add()
    tracker.record(r1);
    tracker.record(r2);

    const chains = tracker.getChains();
    expect(chains.length).toBeGreaterThan(0);

    const fullChain = tracker.getFullChain();
    expect(fullChain.length).toBe(2);

    // Verify the chain is linked
    const r2Recorded = fullChain.find(r => r.agentId === "pro");
    expect(r2Recorded).toBeTruthy();
    expect(r2Recorded!.previousRevelationId).toBe(r1.id);
  });

  it("should export a readable revelation map", () => {
    const tracker = new RevelationTracker();

    const r1 = createRevelation(
      "wesley",
      "The fish are singing at frequencies we can't hear.",
      "What else are we not hearing?",
      0.7
    );

    tracker.record(r1);

    const map = tracker.exportMap();
    expect(map).toContain("Revelation Map");
    expect(map).toContain("wesley");
    expect(map).toContain("fish are singing");
  });

  it("should find revelations by agent", () => {
    const tracker = new RevelationTracker();

    const r1 = createRevelation("hermes", "The sensor is a hydrophone.", "What else hears?", 0.9);
    tracker.record(r1);

    const byAgent = tracker.getByAgent("hermes");
    expect(byAgent.length).toBe(1);
    expect(byAgent[0].insight).toContain("hydrophone");
  });
});
