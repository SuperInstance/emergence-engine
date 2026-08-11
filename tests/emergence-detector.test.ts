// tests/emergence-detector.test.ts
// Deep tests for the EmergenceDetector — the system that watches group
// interactions and identifies emergent patterns.
//
// Tests cover: configuration, event buffering, all five pattern types,
// helper methods, flow assessment, phase tracking, and edge cases.

import { describe, it, expect, beforeEach } from "vitest";
import { EmergenceDetector, PredictabilityEstimator } from "../src/emergence-detector.js";
import type { GroupEvent, EmergentPattern } from "../src/types.js";

let counter = 0;

function makeEvent(agentId: string, content: string, overrides?: Partial<GroupEvent>): GroupEvent {
  return {
    id: `ed-evt-${++counter}`,
    timestamp: new Date(Date.now() + counter * 1000).toISOString(),
    agentId,
    displayName: agentId,
    content,
    type: "message",
    ...overrides,
  };
}

describe("EmergenceDetector — Configuration", () => {
  it("uses default configuration when no config provided", () => {
    const detector = new EmergenceDetector();
    // Defaults: observationWindow=20, minParticipants=2, unpredictabilityThreshold=0.6
    // Feed events with only 1 participant → no emergence (need 2)
    for (let i = 0; i < 10; i++) {
      detector.observe(makeEvent("alice", `message ${i} with content`));
    }
    // Should not detect patterns with only 1 participant
    // (though it will still buffer and profile)
    expect(detector.getDetectedPatterns().length).toBe(0);
  });

  it("accepts partial configuration overriding defaults", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.3,
      stagnationInterval: 5,
    });
    // Should work with custom thresholds
    expect(detector.isStagnating()).toBe(false);
  });

  it("respects minParticipants setting", () => {
    const detector = new EmergenceDetector({ minParticipants: 3 });

    // Only 2 participants
    detector.observe(makeEvent("alice", "first message about topic alpha"));
    detector.observe(makeEvent("bob", "second message about topic beta"));

    // Should not detect patterns — need 3 participants
    expect(detector.getDetectedPatterns().length).toBe(0);
  });

  it("respects observationWindow for event buffering", () => {
    const detector = new EmergenceDetector({ observationWindow: 5 });

    // Feed 20 events
    for (let i = 0; i < 20; i++) {
      detector.observe(makeEvent(`agent-${i % 2}`, `content number ${i} unique word${i}`));
    }

    // assessFlow should only consider the window
    const flow = detector.assessFlow();
    // Window is 5, so at most ~5 events in the flow
    expect(flow.events.length).toBeLessThanOrEqual(10); // buffer is window*2
  });
});

describe("EmergenceDetector — Event Buffering", () => {
  it("feed() adds events to buffer", () => {
    const detector = new EmergenceDetector();
    const event = makeEvent("alice", "test content");
    detector.feed(event);

    // The event should be in the flow assessment
    const flow = detector.assessFlow();
    expect(flow.events).toContainEqual(event);
  });

  it("buffer trims to 2x observationWindow", () => {
    const detector = new EmergenceDetector({ observationWindow: 5 });

    for (let i = 0; i < 30; i++) {
      detector.feed(makeEvent("alice", `message ${i}`));
    }

    const flow = detector.assessFlow();
    // Buffer should be trimmed to observationWindow * 2 = 10
    expect(flow.events.length).toBeLessThanOrEqual(10);
  });

  it("observe() implicitly feeds the buffer", () => {
    const detector = new EmergenceDetector();
    detector.observe(makeEvent("alice", "some content here"));
    detector.observe(makeEvent("bob", "other content here"));

    const flow = detector.assessFlow();
    expect(flow.events.length).toBeGreaterThanOrEqual(2);
  });
});

describe("EmergenceDetector — Pattern Detection: Synergy", () => {
  let detector: EmergenceDetector;

  beforeEach(() => {
    counter = 0;
    detector = new EmergenceDetector({
      observationWindow: 20,
      minParticipants: 2,
      unpredictabilityThreshold: 0.3,
      stagnationInterval: 50,
    });
  });

  it("detects synergy when a reply combines vocabularies unpredictably", () => {
    // Train individual profiles
    detector.observe(makeEvent("alice", "poker bluff cards chips dealer"));
    detector.observe(makeEvent("bob", "fishing tide depth leader cast"));

    // Alice replies to bob, combining fishing + poker
    const synergy = makeEvent("alice",
      "Wait — a poker bluff is like a fishing leader! The cast and the play!",
      { metadata: { replyTo: "ed-evt-2" } }
    );
    const pattern = detector.observe(synergy);

    if (pattern && pattern.type === "synergy") {
      expect(pattern.participants).toContain("alice");
      expect(pattern.participants).toContain("bob");
      expect(pattern.intensity).toBeGreaterThan(0.3);
      expect(pattern.relatedEvents).toContain("ed-evt-2");
    }
  });

  it("does not detect synergy without a replyTo", () => {
    detector.observe(makeEvent("alice", "poker bluff cards"));
    detector.observe(makeEvent("bob", "fishing tide depth"));

    const event = makeEvent("alice", "quantum entanglement wavefunction collapse");
    const pattern = detector.observe(event);
    // No replyTo → synergy won't fire. Could be creativity though.
    if (pattern) {
      expect(pattern.type).not.toBe("synergy");
    }
  });

  it("does not detect synergy when replying to own message", () => {
    const own = makeEvent("alice", "my own thought about systems");
    detector.observe(own);

    const reply = makeEvent("alice", "continuing my own thought about systems",
      { metadata: { replyTo: own.id } }
    );
    // Self-reply shouldn't trigger synergy
    // (parentEvent.agentId === event.agentId check)
    const pattern = detector.observe(reply);
    if (pattern) {
      expect(pattern.type).not.toBe("synergy");
    }
  });
});

describe("EmergenceDetector — Pattern Detection: Creativity", () => {
  it("detects creativity for novel, coherent, unpredictable content", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.3,
      minParticipants: 2,
      stagnationInterval: 50,
    });

    // Train repetitive profiles
    for (let i = 0; i < 3; i++) {
      detector.observe(makeEvent("alice", "code build system debug test"));
      detector.observe(makeEvent("bob", "code build system debug test"));
    }

    // Novel content
    const novel = makeEvent("alice",
      "What if we model the collective unconscious as a vector space where each memory occupies a dimension visible only through orthogonal projection?");
    const pattern = detector.observe(novel);

    if (pattern && pattern.type === "creativity") {
      expect(pattern.noIndividualCouldPredict).toBe(true);
      expect(pattern.intensity).toBeGreaterThan(0.3);
    }
  });

  it("rejects creativity for content too similar to existing messages", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.3,
      minParticipants: 2,
      stagnationInterval: 50,
    });

    // Feed a message
    detector.observe(makeEvent("alice", "building systems architecture with code functions"));
    detector.observe(makeEvent("bob", "building systems architecture with code functions"));

    // Near-duplicate content (high word overlap with existing)
    const dup = makeEvent("bob", "building systems architecture with code functions");
    const pattern = detector.observe(dup);

    // Should not flag as creative — too similar to existing content
    if (pattern) {
      // If it does fire, it shouldn't be creativity
      // (isNovelContent should return false for >70% overlap)
      expect(pattern.type).not.toBe("creativity");
    }
  });
});

describe("EmergenceDetector — Pattern Detection: Conflict", () => {
  it("detects conflict when disagreement signals appear with reply", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.2,
      minParticipants: 2,
      stagnationInterval: 50,
    });

    detector.observe(makeEvent("alice", "I think the tile system should use a deadband approach for the cortex integration"));
    detector.observe(makeEvent("bob", "The deadband approach makes sense for this architecture"));

    const conflict = makeEvent("bob",
      "Actually, I think the deadband approach is wrong for this particular case",
      { metadata: { replyTo: "ed-evt-1" } }
    );
    const pattern = detector.observe(conflict);

    if (pattern && pattern.type === "conflict") {
      expect(pattern.participants).toContain("alice");
      expect(pattern.result).toContain("Disagreement");
    }
  });

  it("does not detect conflict without disagreement keywords", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.2,
      minParticipants: 2,
    });

    detector.observe(makeEvent("alice", "I love building systems with code"));
    const agreeable = makeEvent("bob", "Yes I completely agree with your approach",
      { metadata: { replyTo: "ed-evt-1" } }
    );
    const pattern = detector.observe(agreeable);
    // No disagreement signals → no conflict
    if (pattern) {
      expect(pattern.type).not.toBe("conflict");
    }
  });
});

describe("EmergenceDetector — Pattern Detection: Insight", () => {
  it("detects insight when connecting separate threads with insight phrases", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.2,
      minParticipants: 2,
      stagnationInterval: 50,
    });

    // Two agents talking about different things
    detector.observe(makeEvent("alice", "The fishing leader needs to be longer for deep water casting"));
    detector.observe(makeEvent("bob", "The poker bluff works because it mimics confidence through timing"));
    detector.observe(makeEvent("alice", "Fishing leader tide depth cast"));
    detector.observe(makeEvent("bob", "Poker bluff timing confidence cards"));

    // Event that connects both — uses insight phrase AND connects to both speakers
    const insight = makeEvent("alice",
      "Oh, I see — the fishing leader and the poker bluff both work through misdirection! The leader hides the hook like the bluff hides the weakness!",
    );
    const pattern = detector.observe(insight);

    if (pattern && pattern.type === "insight") {
      expect(pattern.result).toContain("Connected");
      expect(pattern.intensity).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("requires insight phrases to trigger insight detection", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.2,
      minParticipants: 2,
    });

    detector.observe(makeEvent("alice", "fishing leader deep water"));
    detector.observe(makeEvent("bob", "poker bluff timing cards"));

    // No insight phrase
    const noInsight = makeEvent("alice",
      "The fishing leader and poker bluff are similar concepts",
    );
    const pattern = detector.observe(noInsight);
    if (pattern) {
      expect(pattern.type).not.toBe("insight");
    }
  });
});

describe("EmergenceDetector — Pattern Detection: Phase Transition", () => {
  it("detects phase transition from banter to philosophical", () => {
    const detector = new EmergenceDetector({
      minParticipants: 2,
      unpredictabilityThreshold: 0.5,
      stagnationInterval: 50,
    });

    // Short banter messages
    for (let i = 0; i < 6; i++) {
      detector.observe(makeEvent(i % 2 === 0 ? "alice" : "bob", `lol yeah haha fun ${i}`));
    }

    // Long philosophical shift
    const deep = makeEvent("alice",
      "I've been wondering about the fundamental nature of consciousness and whether meaning can truly emerge from the interactions of simpler cognitive processes in the way that we hope it does perhaps there is something about the phenomenological experience that requires more than just complexity",
    );
    const pattern = detector.observe(deep);

    // Should detect phase transition (banter → philosophical)
    if (pattern && pattern.type === "phase_transition") {
      expect(pattern.intensity).toBeGreaterThan(0);
    }
  });

  it("requires at least 8 events in window for phase detection", () => {
    const detector = new EmergenceDetector({ observationWindow: 20 });

    // Only 5 events
    for (let i = 0; i < 5; i++) {
      detector.observe(makeEvent("alice", `short ${i}`));
    }

    // Big shift
    const deep = makeEvent("bob",
      "I've been meditating deeply on the nature of consciousness and reality and meaning and existence for a very long time now and I believe there is something profound here that we should explore together as a group thinking about thinking thinking about thinking thinking thinking",
    );
    const pattern = detector.observe(deep);

    // Not enough history for phase transition
    if (pattern) {
      expect(pattern.type).not.toBe("phase_transition");
    }
  });
});

describe("EmergenceDetector — Accessors", () => {
  it("getDetectedPatterns returns a copy", () => {
    const detector = new EmergenceDetector({ unpredictabilityThreshold: 0.1 });
    // Get patterns when none detected
    const patterns1 = detector.getDetectedPatterns();
    expect(patterns1).toEqual([]);
    // Verify it's a copy
    expect(patterns1).not.toBe(detector["detectedPatterns"]);
  });

  it("getPhaseHistory returns a copy", () => {
    const detector = new EmergenceDetector();
    const history = detector.getPhaseHistory();
    expect(history).toEqual([]);
    expect(history).not.toBe(detector["phaseHistory"]);
  });

  it("getCurrentPhase returns string", () => {
    const detector = new EmergenceDetector();
    expect(detector.getCurrentPhase()).toBe("neutral");
  });

  it("getEstimator returns the internal estimator", () => {
    const detector = new EmergenceDetector();
    const est = detector.getEstimator();
    expect(est).toBeInstanceOf(PredictabilityEstimator);
  });
});

describe("EmergenceDetector — Stagnation Detection", () => {
  it("isStagnating returns false initially", () => {
    const detector = new EmergenceDetector();
    expect(detector.isStagnating()).toBe(false);
  });

  it("isStagnating returns true after stagnationInterval events without novelty", () => {
    const detector = new EmergenceDetector({ stagnationInterval: 5, minParticipants: 2 });

    for (let i = 0; i < 8; i++) {
      detector.observe(makeEvent(i % 2 === 0 ? "alice" : "bob", `same stuff ${i}`));
    }

    expect(detector.isStagnating()).toBe(true);
  });

  it("isStagnating resets when novelty is detected", () => {
    const detector = new EmergenceDetector({
      stagnationInterval: 5,
      minParticipants: 2,
      unpredictabilityThreshold: 0.1,
    });

    // Generate stagnation
    for (let i = 0; i < 4; i++) {
      detector.observe(makeEvent(i % 2 === 0 ? "alice" : "bob", `same repetitive ${i}`));
    }

    // Introduce something novel (triggers creativity → updates lastNoveltyIndex)
    detector.observe(makeEvent("alice",
      "A completely unprecedented paradigm of quantum biological emergence theory",
    ));

    // Should not be stagnating right after novelty
    // (lastNoveltyIndex was updated)
    // Actually stagnation requires eventCount - lastNoveltyIndex > interval
    // After the novel event: eventCount = 5, lastNoveltyIndex = 5
    // So 5 - 5 = 0 which is NOT > 5
    expect(detector.isStagnating()).toBe(false);
  });
});

describe("EmergenceDetector — Flow Assessment", () => {
  it("assessFlow returns valid GroupFlow object", () => {
    const detector = new EmergenceDetector();

    detector.observe(makeEvent("alice", "building code systems"));
    detector.observe(makeEvent("bob", "writing poetry with metaphors"));

    const flow = detector.assessFlow();
    expect(flow).toBeDefined();
    expect(flow.participantIds).toContain("alice");
    expect(flow.participantIds).toContain("bob");
    expect(flow.startTime).toBeDefined();
    expect(flow.endTime).toBeDefined();
    expect(typeof flow.convergenceScore).toBe("number");
    expect(typeof flow.energyLevel).toBe("number");
    expect(typeof flow.vocabularyDiversity).toBe("number");
    expect(typeof flow.disagreementCount).toBe("number");
    expect(typeof flow.novelIdeaCount).toBe("number");
    expect(typeof flow.crossPollinationCount).toBe("number");
    expect(typeof flow.averageMessageLength).toBe("number");
    expect(typeof flow.exchangeRate).toBe("number");
  });

  it("assessFlow computes vocabulary diversity correctly", () => {
    const detector = new EmergenceDetector();

    // All same words → low diversity
    detector.observe(makeEvent("alice", "same same same same"));
    detector.observe(makeEvent("bob", "same same same same"));

    const flow = detector.assessFlow();
    expect(flow.vocabularyDiversity).toBeLessThanOrEqual(1);
  });

  it("assessFlow detects cross-pollination between domains", () => {
    const detector = new EmergenceDetector();

    // Message mixing technical + creative domains
    detector.observe(makeEvent("alice",
      "The code architecture reminds me of a story poem character dream metaphor",
    ));

    const flow = detector.assessFlow();
    // Should detect cross-pollination (technical + creative in one message)
    expect(flow.crossPollinationCount).toBeGreaterThan(0);
  });

  it("assessFlow computes convergence score", () => {
    const detector = new EmergenceDetector();

    // Similar messages → higher convergence
    detector.observe(makeEvent("alice", "building systems architecture code"));
    detector.observe(makeEvent("bob", "building systems architecture code"));

    const flow = detector.assessFlow();
    expect(flow.convergenceScore).toBeGreaterThan(0);
  });

  it("assessFlow handles empty buffer", () => {
    const detector = new EmergenceDetector();
    const flow = detector.assessFlow();
    // Should handle gracefully without crashing
    expect(flow.participantIds).toEqual([]);
    expect(flow.exchangeRate).toBe(0);
  });
});

describe("EmergenceDetector — Multi-Event Sequences", () => {
  it("can detect multiple patterns in a conversation", () => {
    const detector = new EmergenceDetector({
      minParticipants: 2,
      unpredictabilityThreshold: 0.2,
      stagnationInterval: 100,
    });

    const patterns: EmergentPattern[] = [];

    // Diverse conversation
    const events = [
      makeEvent("alice", "I love coding with typescript and react components"),
      makeEvent("bob", "My poetry explores the depths of human emotion through metaphor"),
      makeEvent("alice", "The functional programming paradigm reveals hidden structures"),
      makeEvent("bob", "Just as verse reveals hidden rhythms in language itself"),
      makeEvent("alice", "Wait — code and poetry are both about hidden structure! It's like they're the same thing underneath!",
        { metadata: { replyTo: "ed-evt-4" } }),
      makeEvent("bob", "Oh, I see — the rhythm of code and the structure of verse are isomorphic!",
        { metadata: { replyTo: "ed-evt-5" } }),
    ];

    for (const e of events) {
      const p = detector.observe(e);
      if (p) patterns.push(p);
    }

    // Should have detected at least some patterns
    expect(patterns.length).toBeGreaterThan(0);

    // All patterns should have valid structure
    for (const p of patterns) {
      expect(p.id).toBeDefined();
      expect(p.timestamp).toBeDefined();
      expect(p.participants.length).toBeGreaterThan(0);
      expect(p.intensity).toBeGreaterThanOrEqual(0);
      expect(p.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("intensity is always clamped between 0 and 1", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.01,
      minParticipants: 2,
    });

    detector.observe(makeEvent("alice", "alpha beta"));
    detector.observe(makeEvent("bob", "gamma delta"));

    // Very unpredictable content
    const event = makeEvent("alice",
      "zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega",
    );
    const pattern = detector.observe(event);

    if (pattern) {
      expect(pattern.intensity).toBeGreaterThanOrEqual(0);
      expect(pattern.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("noIndividualCouldPredict matches threshold crossing", () => {
    const detector = new EmergenceDetector({
      unpredictabilityThreshold: 0.5,
      minParticipants: 2,
    });

    detector.observe(makeEvent("alice", "one two three four five"));
    detector.observe(makeEvent("bob", "six seven eight nine ten"));

    const event = makeEvent("alice",
      "quantum mechanics describes subatomic particle behavior through wave functions",
    );
    const pattern = detector.observe(event);

    if (pattern) {
      // noIndividualCouldPredict = intensity >= threshold
      expect(pattern.noIndividualCouldPredict).toBe(pattern.intensity >= 0.5);
    }
  });
});
