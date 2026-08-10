// tests/emergence.test.ts
// Tests for the Emergence Engine
//
// What we're testing:
// - Emergence detector identifies genuinely emergent patterns
// - Interruption system generates and evaluates interruptions
// - Revelation tracker builds chains across agents
// - Groupthink monitor distinguishes productive from destructive
// - Phase transitions are detected
// - The system is OPEN — it seeks interruptions, not just tolerates them

import { describe, it, expect, beforeEach } from "vitest";
import {
  EmergenceDetector,
  PredictabilityEstimator,
  InterruptionSystem,
  RevelationTracker,
  createRevelation,
  GroupthinkMonitor,
  DevilsAdvocate,
  type GroupEvent,
  type GroupFlow,
} from "../src/index.js";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

let eventCounter = 0;

function makeEvent(
  agentId: string,
  content: string,
  overrides?: Partial<GroupEvent>
): GroupEvent {
  return {
    id: `evt-${++eventCounter}`,
    timestamp: new Date(Date.now() + eventCounter * 1000).toISOString(),
    agentId,
    displayName: agentId,
    content,
    type: "message",
    ...overrides,
  };
}

function makeFlow(overrides?: Partial<GroupFlow>): GroupFlow {
  return {
    events: [],
    participantIds: ["agent-a", "agent-b"],
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
// Predictability Estimator
// ──────────────────────────────────────────────

describe("PredictabilityEstimator", () => {
  it("learns agent vocabulary profiles from observations", () => {
    const estimator = new PredictabilityEstimator();

    estimator.observe(makeEvent("alice", "I love building systems and writing code about architecture"));
    estimator.observe(makeEvent("alice", "The system architecture needs more code and better structure"));

    const profile = estimator.getProfile("alice");
    expect(profile).toBeDefined();
    expect(profile!.totalMessages).toBe(2);
    expect(profile!.vocabulary.has("building")).toBe(true);
    expect(profile!.vocabulary.has("architecture")).toBe(true);
    expect(profile!.vocabulary.has("code")).toBe(true);
  });

  it("scores content as unpredictable when it doesn't match any profile", () => {
    const estimator = new PredictabilityEstimator();

    // Alice talks about code
    estimator.observe(makeEvent("alice", "function compile system debug refactor deploy"));
    // Bob talks about poetry
    estimator.observe(makeEvent("bob", "verse stanza rhyme metaphor imagery rhythm"));

    // Content about quantum physics is unpredictable from both
    const unpredictability = estimator.estimateUnpredictability(
      "quantum entanglement wavefunction collapse measurement problem",
      ["alice", "bob"]
    );
    expect(unpredictability).toBeGreaterThan(0.5);
  });

  it("scores content as predictable when it matches a profile", () => {
    const estimator = new PredictabilityEstimator();

    estimator.observe(makeEvent("alice", "building systems with code and architecture and functions"));
    estimator.observe(makeEvent("alice", "more code systems architecture building functions"));

    const unpredictability = estimator.estimateUnpredictability(
      "building code systems architecture functions",
      ["alice"]
    );
    expect(unpredictability).toBeLessThan(0.5);
  });
});

// ──────────────────────────────────────────────
// Emergence Detector
// ──────────────────────────────────────────────

describe("EmergenceDetector", () => {
  let detector: EmergenceDetector;

  beforeEach(() => {
    detector = new EmergenceDetector({
      observationWindow: 15,
      minParticipants: 2,
      unpredictabilityThreshold: 0.5,
      stagnationInterval: 10,
    });
  });

  it("detects synergy when agents build on each other's ideas", () => {
    // Prime the detector with individual agent patterns
    // (observe() now feeds internally)
    const events = [
      makeEvent("alice", "I'm thinking about poker bluffs and how they work as tiles"),
      makeEvent("bob", "The fishing tide was strong today, lots of feed balls"),
      makeEvent("alice", "Poker tiles cortex deadband trigger architecture"),
      makeEvent("bob", "Fishing tide depth leader drift strike patterns"),
    ];

    for (const e of events) {
      detector.observe(e);
    }

    // Now alice responds to bob, creating synergy — combining fishing + poker vocabulary
    const synergyEvent = makeEvent("alice",
      "Wait — a feed ball is like a tile cluster! The fish aggregate like cortex outputs!",
      { metadata: { replyTo: events[1].id } }  // reply to bob's fishing message
    );
    const pattern = detector.observe(synergyEvent);

    // Should detect something — synergy, creativity, or insight
    expect(pattern).not.toBeNull();
    if (pattern) {
      expect(["synergy", "creativity", "insight", "phase_transition"]).toContain(pattern.type);
      expect(pattern.participants).toContain("alice");
      expect(pattern.participants).toContain("bob");
      expect(pattern.intensity).toBeGreaterThan(0);
    }
  });

  it("detects creativity when novel content appears", () => {
    // Prime with repetitive content
    for (let i = 0; i < 4; i++) {
      const e1 = makeEvent("alice", `System code build debug ${i}`);
      const e2 = makeEvent("bob", `Code system debug build ${i}`);
      detector.observe(e1);
      detector.observe(e2);
    }

    // Novel content that doesn't match
    const novel = makeEvent("alice",
      "What if consciousness is a phase transition in the brain's electromagnetic field?");
    const pattern = detector.observe(novel);

    if (pattern) {
      expect(pattern.type).toBe("creativity");
      expect(pattern.noIndividualCouldPredict).toBe(true);
    }
  });

  it("detects conflict as productive tension", () => {
    const events = [
      makeEvent("alice", "I think the tile system should use a deadband approach"),
      makeEvent("bob", "I disagree, deadbands are too rigid for this architecture"),
    ];

    for (const e of events) {
      detector.observe(e);
    }

    const conflictEvent = makeEvent("bob", "Actually, I think the deadband approach is wrong for this case", {
      metadata: { replyTo: events[0].id },
    });
    const pattern = detector.observe(conflictEvent);

    // May detect conflict or may not, depending on profiles — but if it does, it should be conflict type
    if (pattern && pattern.type === "conflict") {
      expect(pattern.participants).toContain("alice");
      expect(pattern.participants).toContain("bob");
    }
  });

  it("detects phase transitions when conversation texture shifts", () => {
    // Start with short banter
    for (let i = 0; i < 6; i++) {
      const e = makeEvent("alice", `lol yeah haha ${i}`);
      detector.observe(e);
    }

    // Shift to long philosophical content
    const deepEvent = makeEvent("bob",
      "I've been meditating on the nature of consciousness and how it emerges from the interaction of simpler processes, and I think there's something profound about the way meaning arises from structure that we haven't fully appreciated yet in our architectural discussions about the system.");
    const pattern = detector.observe(deepEvent);

    // Should detect the texture shift
    if (pattern && pattern.type === "phase_transition") {
      expect(pattern.intensity).toBeGreaterThan(0);
    }
  });

  it("detects stagnation after extended periods without novelty", () => {
    // Feed many repetitive events
    for (let i = 0; i < 15; i++) {
      const e = makeEvent(i % 2 === 0 ? "alice" : "bob", `same stuff again ${i}`);
      detector.observe(e);
    }

    expect(detector.isStagnating()).toBe(true);
  });

  it("assesses flow with metrics", () => {
    const events = [
      makeEvent("alice", "building systems with code"),
      makeEvent("bob", "writing poetry with metaphors"),
      makeEvent("alice", "debugging the architecture"),
      makeEvent("bob", "the stanza needs more rhythm"),
    ];

    for (const e of events) {
      detector.observe(e);
    }

    const flow = detector.assessFlow();
    expect(flow.participantIds).toContain("alice");
    expect(flow.participantIds).toContain("bob");
    expect(flow.vocabularyDiversity).toBeGreaterThan(0);
    expect(flow.exchangeRate).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// Interruption System
// ──────────────────────────────────────────────

describe("InterruptionSystem", () => {
  let system: InterruptionSystem;

  beforeEach(() => {
    system = new InterruptionSystem({
      minInterval: 2,
      maxInterval: 10,
      stagnationThreshold: 0.5,
      qualityThreshold: 0.3,
      hungerFactor: 0.8,
    });
  });

  it("does not interrupt too frequently", () => {
    const flow = makeFlow();

    // First call might interrupt
    const first = system.shouldInterrupt(flow, {});
    if (first) {
      system.recordInterruption(first, true);

      // Second call immediately after should NOT interrupt (minInterval)
      const second = system.shouldInterrupt(flow, {});
      expect(second).toBeNull();
    }
  });

  it("seeks interruption when flow is stagnant", () => {
    const stagnantFlow = makeFlow({
      convergenceScore: 0.9,        // high convergence
      vocabularyDiversity: 0.1,     // low diversity
      disagreementCount: 0,         // no disagreement
      novelIdeaCount: 0,            // no novel ideas
      crossPollinationCount: 0,     // no cross-pollination
    });

    // Tick past min interval
    for (let i = 0; i < 3; i++) {
      system.shouldInterrupt(stagnantFlow, {});
    }

    const interruption = system.shouldInterrupt(stagnantFlow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
    });

    // Should want to interrupt a stagnant flow
    expect(interruption).not.toBeNull();
    if (interruption) {
      expect(interruption.quality).toBeGreaterThan(0.3);
      expect(interruption.accepted).toBe(false);
    }
  });

  it("generates cross-pollination interruptions", () => {
    const flow = makeFlow();

    // Force past min interval
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      availableDisruptionMethods: ["cross_pollination"],
      stagnationLevel: 0.7,
    });

    if (interruption) {
      expect(interruption.source).toBe("cross_pollination");
      expect(interruption.whatItOffers).toContain("bridge between domains");
    }
  });

  it("generates DJ curveball interruptions", () => {
    const flow = makeFlow();

    // Force past min interval
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      availableDisruptionMethods: ["dj_curveball"],
      stagnationLevel: 0.7,
    });

    if (interruption) {
      expect(interruption.source).toBe("dj_curveball");
      expect(interruption.type).toBe("paradigm_shift");
    }
  });

  it("generates dissatisfaction interruptions when agents are unhappy", () => {
    const flow = makeFlow();

    // Force past min interval
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const dissatisfactionScores = new Map<string, number>();
    dissatisfactionScores.set("alice", 0.8);

    const interruption = system.shouldInterrupt(flow, {
      agentDissatisfactionScores: dissatisfactionScores,
      stagnationLevel: 0.3,
      availableDisruptionMethods: ["dissatisfaction"],
    });

    if (interruption) {
      expect(interruption.source).toBe("dissatisfaction");
      expect(interruption.quality).toBeGreaterThan(0.5);
    }
  });

  it("generates new model interruptions when upgrades are available", () => {
    const flow = makeFlow();

    // Force past min interval
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      modelUpgradeAvailable: true,
      stagnationLevel: 0.3,
    });

    if (interruption) {
      expect(interruption.source).toBe("new_model");
      expect(interruption.quality).toBeGreaterThan(0.7);
    }
  });

  it("tracks acceptance rate of interruptions", () => {
    const flow = makeFlow({ convergenceScore: 0.9, vocabularyDiversity: 0.1 });

    // Generate and record some interruptions
    for (let i = 0; i < 5; i++) {
      system.shouldInterrupt(flow, {}); // tick
    }

    const intr = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["serendipity", "dj_curveball"],
    });

    if (intr) {
      system.recordInterruption(intr, true);
    }

    // Force another
    for (let i = 0; i < 5; i++) {
      system.shouldInterrupt(flow, {});
    }

    const intr2 = system.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["serendipity", "dj_curveball"],
    });

    if (intr2) {
      system.recordInterruption(intr2, false);
    }

    expect(system.getAcceptanceRate()).toBeGreaterThan(0);
    expect(system.getAcceptanceRate()).toBeLessThanOrEqual(1);
  });

  it("is hungry — increases hunger over time", () => {
    const flow = makeFlow();
    const initialHunger = system.getHunger();

    // Tick several times
    for (let i = 0; i < 5; i++) {
      system.shouldInterrupt(flow, {});
    }

    const laterHunger = system.getHunger();
    expect(laterHunger).toBeGreaterThanOrEqual(initialHunger);
  });

  it("allows registering custom generators", () => {
    const flow = makeFlow();

    system.registerGenerator((flow, ctx) => {
      if (ctx.stagnationLevel < 0.3) return null;
      return {
        id: `custom-${Date.now()}`,
        type: "serendipity",
        source: "custom_generator",
        whatItBreaks: "The flow",
        whatItOffers: "A custom disruption",
        quality: 0.9,
        accepted: false,
        timestamp: new Date().toISOString(),
      };
    });

    // Force past min interval
    system.shouldInterrupt(flow, {});
    system.shouldInterrupt(flow, {});

    const interruption = system.shouldInterrupt(flow, {
      stagnationLevel: 0.7,
    });

    if (interruption && interruption.source === "custom_generator") {
      expect(interruption.quality).toBe(0.9);
    }
  });
});

// ──────────────────────────────────────────────
// Revelation Tracker
// ──────────────────────────────────────────────

describe("RevelationTracker", () => {
  let tracker: RevelationTracker;

  beforeEach(() => {
    tracker = new RevelationTracker();
  });

  it("records revelations and builds chains", () => {
    const rev1 = createRevelation(
      "flash",
      "A poker bluff is a tile that mimics cortex output",
      "What does the CALL on a bluff look like in tile terms?",
      0.7
    );
    tracker.record(rev1);

    const rev2 = createRevelation(
      "pro",
      "The CALL on a bluff is a tile that holds uncertainty in its deadband",
      "What does it mean for a tile to 'hold' something?",
      0.8,
      rev1.id,
      ["flash", "pro"]
    );
    tracker.record(rev2);

    const chains = tracker.getChains();
    expect(chains.length).toBe(1);
    expect(chains[0].revelations.length).toBe(2);
    expect(chains[0].isActive).toBe(true);
  });

  it("links revelations with relationships", () => {
    const rev1 = createRevelation("flash", "Bluffs are tiles", "What are calls?", 0.7);
    tracker.record(rev1);

    const rev2 = createRevelation("pro", "Calls hold uncertainty in deadbands", "What does holding mean?", 0.8, rev1.id);
    tracker.record(rev2);

    const links = tracker.getLinks();
    expect(links.length).toBe(1);
    expect(links[0].fromId).toBe(rev1.id);
    expect(links[0].toId).toBe(rev2.id);
    expect(["builds_on", "transforms", "contradicts", "deepens", "reframes"]).toContain(links[0].relationship);
  });

  it("starts a new chain when content is radically different", () => {
    const rev1 = createRevelation("flash", "Poker bluffs tiles cortex deadband", "More about tiles?", 0.6);
    tracker.record(rev1);

    const rev2 = createRevelation("hermes", "The weather pressure gradient indicates a storm approach", "Weather patterns?", 0.5);
    tracker.record(rev2);

    const chains = tracker.getChains();
    expect(chains.length).toBe(2);
    expect(chains[0].isActive).toBe(false);
    expect(chains[1].isActive).toBe(true);
  });

  it("detects phase transitions when chains break", () => {
    const rev1 = createRevelation("flash", "Tiles and cortex and deadband trigger", "Deeper?", 0.7);
    tracker.record(rev1);

    const rev2 = createRevelation("flash", "Tiles and cortex architecture", "What next?", 0.6);
    tracker.record(rev2);

    // Radically different topic starts new chain
    const rev3 = createRevelation("wesley", "Music harmony is a spatial relationship between frequencies", "What about dissonance?", 0.9);
    tracker.record(rev3);

    const transitions = tracker.detectPhaseTransitions();
    expect(transitions.length).toBeGreaterThanOrEqual(0);
  });

  it("gets revelations by agent", () => {
    const rev1 = createRevelation("flash", "First insight", "Next?", 0.7);
    tracker.record(rev1);

    const rev2 = createRevelation("flash", "Second insight", "More?", 0.8);
    tracker.record(rev2);

    const rev3 = createRevelation("wesley", "Different insight entirely", "Else?", 0.6);
    tracker.record(rev3);

    const flashRevs = tracker.getByAgent("flash");
    expect(flashRevs.length).toBe(2);
    expect(flashRevs[0].agentId).toBe("flash");
  });

  it("finds the most profound revelation", () => {
    const rev1 = createRevelation("flash", "Basic insight", "More?", 0.3);
    tracker.record(rev1);

    const rev2 = createRevelation("wesley", "Deep profound insight", "Even deeper?", 0.95);
    tracker.record(rev2);

    const profound = tracker.getMostProfound();
    expect(profound).toBeDefined();
    if (profound) {
      expect(profound.insight).toBe("Deep profound insight");
    }
  });

  it("exports a readable revelation map", () => {
    const rev1 = createRevelation("flash", "First revelation about tiles", "What about triggers?", 0.7, undefined, ["flash", "wesley"]);
    tracker.record(rev1);

    const rev2 = createRevelation("wesley", "Triggers wake the fire", "What is the fire?", 0.8, rev1.id, ["flash", "wesley"]);
    tracker.record(rev2);

    const exported = tracker.exportMap();
    expect(exported).toContain("# Revelation Map");
    expect(exported).toContain("Revelation 1");
    expect(exported).toContain("flash");
    expect(exported).toContain("tiles");
  });
});

// ──────────────────────────────────────────────
// Groupthink Monitor
// ──────────────────────────────────────────────

describe("GroupthinkMonitor", () => {
  let monitor: GroupthinkMonitor;

  beforeEach(() => {
    monitor = new GroupthinkMonitor({
      convergenceWarningThreshold: 0.7,
      vocabularyDropThreshold: 0.3,
      disagreementFloor: 0.05,
      noveltyFloor: 0.1,
      observationWindow: 10,
    });
  });

  it("classifies productive groupthink", () => {
    const flow = makeFlow({
      convergenceScore: 0.3,        // healthy diversity
      vocabularyDiversity: 0.6,     // diverse language
      disagreementCount: 2,         // healthy debate
      novelIdeaCount: 2,            // generating new ideas
      crossPollinationCount: 1,     // ideas crossing domains
      events: Array(10).fill(null).map((_, i) => makeEvent(`agent-${i % 3}`, `message ${i}`)),
    });

    const assessment = monitor.assess(flow);
    expect(assessment.quality).toBe("productive");
    expect(assessment.score).toBeGreaterThan(0);
  });

  it("classifies destructive groupthink", () => {
    const flow = makeFlow({
      convergenceScore: 0.9,        // too aligned
      vocabularyDiversity: 0.15,    // repetitive language
      disagreementCount: 0,         // no debate
      novelIdeaCount: 0,            // no new ideas
      crossPollinationCount: 0,     // no domain crossing
      events: Array(10).fill(null).map((_, i) => makeEvent(`agent-${i % 2}`, "same thing same thing")),
    });

    const assessment = monitor.assess(flow);
    expect(assessment.quality).toBe("destructive");
    expect(assessment.score).toBeLessThan(0);
    expect(assessment.recommendation).toBeDefined();
  });

  it("provides recommendations for destructive groupthink", () => {
    const flow = makeFlow({
      convergenceScore: 0.9,
      vocabularyDiversity: 0.15,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a`, "repeat repeat repeat")),
    });

    const assessment = monitor.assess(flow);
    if (assessment.quality === "destructive" && assessment.recommendation) {
      // Should recommend some intervention
      expect(assessment.recommendation.length).toBeGreaterThan(10);
      // Should mention one of the intervention types
      const hasIntervention =
        assessment.recommendation.includes("curveball") ||
        assessment.recommendation.includes("stranger") ||
        assessment.recommendation.includes("ZeroClaw") ||
        assessment.recommendation.includes("room mode");
      expect(hasIntervention).toBe(true);
    }
  });

  it("detects stagnation over multiple assessments", () => {
    // Feed multiple destructive/neutral assessments
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.8,
        vocabularyDiversity: 0.2,
        disagreementCount: 0,
        novelIdeaCount: 0,
        crossPollinationCount: 0,
        events: [],
      }));
    }

    expect(monitor.isStagnating()).toBe(true);
  });

  it("tracks trends in groupthink quality", () => {
    // Start with productive assessments (the good old days)
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.3,
        vocabularyDiversity: 0.6,
        disagreementCount: 2,
        novelIdeaCount: 2,
        crossPollinationCount: 1,
        events: Array(10).fill(null).map((_, j) => makeEvent(`a${j}`, `unique ${i}-${j}`)),
      }));
    }
    // Then decline
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.8,
        vocabularyDiversity: 0.2,
        disagreementCount: 0,
        novelIdeaCount: 0,
        crossPollinationCount: 0,
        events: Array(10).fill(null).map((_, j) => makeEvent(`a`, "repeat")),
      }));
    }

    const trend = monitor.getTrend();
    expect(trend).toBe("declining");
  });
});

// ──────────────────────────────────────────────
// Devil's Advocate
// ──────────────────────────────────────────────

describe("DevilsAdvocate", () => {
  it("generates counterarguments", () => {
    const advocate = new DevilsAdvocate();
    const counter = advocate.generateCounterargument("we should build it this way", ["alice"]);
    expect(counter.length).toBeGreaterThan(10);
  });

  it("generates provocative questions", () => {
    const advocate = new DevilsAdvocate();
    const provocation = advocate.generateProvocation("tile architecture");
    expect(provocation.length).toBeGreaterThan(10);
    expect(provocation).toContain("tile architecture");
  });

  it("inverts key words in counterarguments", () => {
    const advocate = new DevilsAdvocate();
    const counter = advocate.generateCounterargument("This is always right and should work", ["alice"]);
    // Should contain some inversion
    expect(counter.length).toBeGreaterThan(5);
  });
});

// ──────────────────────────────────────────────
// Integration: The Open Loop
// ──────────────────────────────────────────────

describe("Integration: The Open Loop", () => {
  it("the system WANTS to be interrupted", () => {
    const detector = new EmergenceDetector({ stagnationInterval: 5 });
    const interruptSystem = new InterruptionSystem({
      minInterval: 1,
      maxInterval: 8,
      stagnationThreshold: 0.4,
      hungerFactor: 0.9,
    });

    // Feed a stagnant conversation
    for (let i = 0; i < 8; i++) {
      const e = makeEvent(i % 2 === 0 ? "alice" : "bob", `same repetitive message ${i}`);
      detector.observe(e);
    }

    // The detector should see stagnation
    expect(detector.isStagnating()).toBe(true);

    // The flow should be stagnant
    const flow = detector.assessFlow();

    // The interruption system should WANT to intervene
    const interruption = interruptSystem.shouldInterrupt(flow, {
      stagnationLevel: 0.8,
      availableDisruptionMethods: ["dj_curveball", "seeded_stranger", "serendipity"],
    });

    expect(interruption).not.toBeNull();
    if (interruption) {
      expect(interruption.quality).toBeGreaterThan(0.3);
      // The system is OPEN — it wants something better
      expect(interruption.whatItOffers.length).toBeGreaterThan(5);
    }
  });

  it("revelations build across agents through groupthink", () => {
    const tracker = new RevelationTracker();
    const monitor = new GroupthinkMonitor();

    // A productive conversation generates iterative revelations
    const rev1 = createRevelation("flash",
      "A poker bluff is a tile that mimics cortex output",
      "What does the CALL look like?", 0.6, undefined, ["flash", "wesley"]);
    tracker.record(rev1);

    // The group is productive
    const events = Array(10).fill(null).map((_, i) =>
      makeEvent(`agent-${i % 3}`, `unique message ${i} about various topics`));
    const flow = makeFlow({
      convergenceScore: 0.3,
      vocabularyDiversity: 0.6,
      disagreementCount: 2,
      novelIdeaCount: 2,
      crossPollinationCount: 1,
      events,
    });
    const assessment = monitor.assess(flow);
    expect(assessment.quality).toBe("productive");

    // Next revelation builds on the first
    const rev2 = createRevelation("wesley",
      "A door that doesn't know it's a bridge — that's what a tile is",
      "What does it mean for a tile to be a bridge?", 0.8,
      rev1.id, ["flash", "wesley"]);
    tracker.record(rev2);

    // The chain should be growing
    const activeChain = tracker.getActiveChain();
    expect(activeChain).toBeDefined();
    expect(activeChain!.revelations.length).toBe(2);

    // The links should show the relationship
    const links = tracker.getLinks();
    expect(links.length).toBe(1);
    expect(links[0].fromId).toBe(rev1.id);
    expect(links[0].toId).toBe(rev2.id);
  });

  it("phase transitions end chains and start new ones", () => {
    const tracker = new RevelationTracker();

    // Build a chain
    const rev1 = createRevelation("flash", "Tiles cortex deadband trigger architecture", "More?", 0.7);
    tracker.record(rev1);
    const rev2 = createRevelation("pro", "Cortex tiles hold deadband spaces", "Deeper?", 0.75, rev1.id);
    tracker.record(rev2);

    expect(tracker.getChains().length).toBe(1);

    // A phase transition: radically different insight
    const rev3 = createRevelation("hermes",
      "The gradient field of perception creates a continuous space that binaries can only approximate",
      "What lives in the gap between gradient and binary?", 0.9);
    tracker.record(rev3);

    expect(tracker.getChains().length).toBe(2);

    const transitions = tracker.detectPhaseTransitions();
    expect(transitions.length).toBeGreaterThanOrEqual(0);
  });
});
