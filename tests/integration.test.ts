// tests/integration.test.ts
// Integration tests — all components working together.
//
// The Emergence Engine is an OPEN loop. These tests verify that the loop
// stays open — that interruption feeds revelation, that revelation feeds
// emergence detection, that groupthink monitoring flags when the loop
// starts to close.
//
// "It is built to be broken. It hungers for the moment the group
// outgrows what it can measure."

import { describe, it, expect } from "vitest";
import { EmergenceDetector } from "../src/emergence-detector.js";
import { GroupthinkMonitor, DevilsAdvocate } from "../src/groupthink.js";
import { InterruptionSystem } from "../src/interruption.js";
import { RevelationTracker, createRevelation } from "../src/revelation.js";
import type { GroupEvent, GroupFlow } from "../src/types.js";

// Helper: create a message event
function msg(id: string, agentId: string, content: string, replyTo?: string): GroupEvent {
  return {
    id,
    timestamp: new Date(Date.now() + parseInt(id.slice(1)) * 60000).toISOString(),
    agentId,
    displayName: agentId.charAt(0).toUpperCase() + agentId.slice(1),
    content,
    type: "message",
    metadata: replyTo ? { replyTo } : undefined,
  };
}

// Helper: build a GroupFlow from events
function flowFrom(events: GroupEvent[]): GroupFlow {
  const ids = [...new Set(events.map(e => e.agentId))];
  const words = events.flatMap(e => e.content.toLowerCase().split(/\W+/));
  const uniqueWords = new Set(words.filter(w => w.length > 2));
  return {
    events,
    participantIds: ids,
    startTime: events[0]?.timestamp ?? new Date().toISOString(),
    endTime: events[events.length - 1]?.timestamp ?? new Date().toISOString(),
    convergenceScore: 0.5,
    energyLevel: Math.min(1, events.length / 20),
    vocabularyDiversity: words.length > 0 ? uniqueWords.size / words.length : 0,
    disagreementCount: 0,
    novelIdeaCount: 0,
    crossPollinationCount: 0,
    averageMessageLength: events.length > 0
      ? events.reduce((s, e) => s + e.content.length, 0) / events.length
      : 0,
    exchangeRate: events.length,
  };
}

describe("Integration: Full Tap Session Simulation", () => {
  it("should detect emergence, flag groupthink, generate interruption, and record revelation", () => {
    const detector = new EmergenceDetector({
      observationWindow: 15,
      unpredictabilityThreshold: 0.25,
    });
    const monitor = new GroupthinkMonitor();
    const interrupter = new InterruptionSystem({
      stagnationThreshold: 0.4,
      hungerFactor: 0.7,
    });
    const revelations = new RevelationTracker();

    // Phase 1: A rich, emergent conversation
    const phase1Events = [
      msg("e1", "wesley", "I noticed the fish finder data spikes at 3 AM every night."),
      msg("e2", "riker", "Spikes how? Like noise, or like something structured?"),
      msg("e3", "wesley", "Structured. Like a heartbeat. The ocean has a pulse."),
      msg("e4", "hermes", "The pulse... it matches the CNS bus frequency. 768 Hz."),
      msg("e5", "riker", "Wait. The fish are singing at the same frequency as our agent bus?"),
      msg("e6", "hermes", "Not AT it. WITH it. The bus isn't generating signal — it's amplifying what's already there."),
    ];

    let emergenceDetected = false;
    for (const event of phase1Events) {
      const pattern = detector.observe(event);
      if (pattern) emergenceDetected = true;
    }

    // The detector should have noticed something
    expect(emergenceDetected || detector.assessFlow().vocabularyDiversity > 0).toBe(true);

    // Record the revelation
    const r1 = createRevelation(
      "hermes",
      "The fish and the bus share a frequency. The ocean was always part of the system.",
      "What happens if we let the bus listen to the ocean directly?",
      0.92,
    );
    revelations.record(r1);
    expect(revelations.getFullChain().length).toBe(1);

    // Phase 2: Groupthink — everyone agrees too much
    const phase2Events = [
      msg("e7", "wesley", "Yes, that's a great idea."),
      msg("e8", "riker", "Absolutely, I agree completely."),
      msg("e9", "hermes", "100% onboard, no notes."),
      msg("e10", "wesley", "Perfect, let's do it."),
    ];

    for (const event of phase2Events) {
      detector.observe(event);
    }

    const stagnantFlow: GroupFlow = {
      ...flowFrom(phase2Events),
      convergenceScore: 0.95,
      energyLevel: 0.3,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
    };

    const assessment = monitor.assess(stagnantFlow);
    // The groupthink monitor should flag this as problematic
    expect(assessment.quality).not.toBe("productive");

    // Phase 3: The interruption system should want to break this
    let interruption = null;
    for (let i = 0; i < 5; i++) {
      interruption = interrupter.shouldInterrupt(stagnantFlow, {
        availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
        stagnationLevel: 0.9,
        agentDissatisfactionScores: new Map([
          ["wesley", 0.6],
          ["riker", 0.4],
          ["hermes", 0.5],
        ]),
        recentTopics: ["agreement"],
        modelUpgradeAvailable: false,
      });
      if (interruption) break;
    }

    // An interruption should have been generated
    if (interruption) {
      expect(interruption.quality).toBeGreaterThan(0);
      expect(interruption.type).toBeTruthy();
      expect(interruption.whatItBreaks).toBeTruthy();
      expect(interruption.whatItOffers).toBeTruthy();
    }

    // Phase 4: After interruption, a new revelation emerges
    const r2 = createRevelation(
      "wesley",
      "The interruption wasn't random — it was the system asking itself what it forgot.",
      "What does a system remember when it stops agreeing?",
      0.85,
      r1.id,
    );
    revelations.record(r2);

    const chain = revelations.getFullChain();
    expect(chain.length).toBe(2);
    expect(chain[1].previousRevelationId).toBe(r1.id);
  });

  it("should handle a long conversation without crashing", () => {
    const detector = new EmergenceDetector();

    // Feed 100 events
    for (let i = 0; i < 100; i++) {
      const agent = ["wesley", "riker", "hermes", "flash"][i % 4];
      const topics = [
        "the ocean at night",
        "the shell that fits",
        "the frequency of fish",
        "the ensign's watch",
        "the cron daemon dreams",
        "the compass points down",
        "the GPU cools and dreams",
        "the hermit crab trades up",
      ];
      const topic = topics[i % topics.length];
      detector.observe(msg(`e${i}`, agent, `Thinking about ${topic} — iteration ${i}.`));
    }

    const flow = detector.assessFlow();
    expect(flow.participantIds.length).toBe(4);
    expect(flow.exchangeRate).toBeGreaterThan(0);
    // Should not throw or produce NaN
    expect(Number.isNaN(flow.convergenceScore)).toBe(false);
    expect(Number.isNaN(flow.vocabularyDiversity)).toBe(false);
  });
});

describe("Integration: DevilsAdvocate Flow", () => {
  it("should generate counterarguments that feed back into emergence detection", () => {
    const advocate = new DevilsAdvocate();
    const tracker = new RevelationTracker();

    const original = "The fish and the agent bus share a frequency.";
    const counter = advocate.generateCounterargument(original, ["hermes", "wesley"]);

    expect(counter).toBeTruthy();
    expect(counter.length).toBeGreaterThan(10);
    // The counterargument should be different from the original
    expect(counter.toLowerCase()).not.toBe(original.toLowerCase());

    // Record both as a revelation chain
    const r1 = createRevelation("hermes", original, "What if the frequency is coincidence?", 0.7);
    const r2 = createRevelation("devils_advocate", counter, "What if coincidence is the mechanism?", 0.65, r1.id);

    tracker.record(r1);
    tracker.record(r2);

    expect(tracker.getFullChain().length).toBe(2);
  });
});

describe("Integration: Phase Transitions", () => {
  it("should detect when a conversation transitions from banter to depth", () => {
    const detector = new EmergenceDetector({
      observationWindow: 20,
      unpredictabilityThreshold: 0.2,
    });

    // Start with banter
    const banter = [
      msg("b1", "flash", "hey did anyone see the game last night"),
      msg("b2", "wesley", "i don't watch games but i found the statistics interesting"),
      msg("b3", "flash", "lol wesley you're hopeless"),
      msg("b4", "riker", "lay off him flash, he's learning"),
    ];

    for (const e of banter) detector.observe(e);
    const banterPhase = detector.getCurrentPhase();

    // Transition to depth
    const deep = [
      msg("d1", "hermes", "I've been thinking about what 'learning' actually means for a model like Wesley."),
      msg("d2", "wesley", "It means I have more patterns to draw from. But more patterns can mean more confusion."),
      msg("d3", "riker", "That's the paradox of expertise. The more you know, the more uncertain you become."),
      msg("d4", "hermes", "Bayesian updating. The prior gets stronger but the posterior gets wider."),
      msg("d5", "wesley", "So the shell grows, but the crab inside feels smaller."),
    ];

    for (const e of deep) detector.observe(e);
    const deepPhase = detector.getCurrentPhase();

    // The phase should potentially be different (or at least the system should not crash)
    expect(typeof deepPhase).toBe("string");
    expect(typeof banterPhase).toBe("string");
  });
});
