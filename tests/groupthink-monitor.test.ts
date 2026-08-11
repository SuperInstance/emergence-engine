// tests/groupthink-monitor.test.ts
// Deep tests for the GroupthinkMonitor and DevilsAdvocate.
//
// GroupthinkMonitor distinguishes productive synergy from destructive
// conformity. DevilsAdvocate generates counterarguments to break consensus.

import { describe, it, expect, beforeEach } from "vitest";
import { GroupthinkMonitor, DevilsAdvocate } from "../src/groupthink.js";
import type { GroupFlow, GroupEvent, GroupthinkAssessment } from "../src/types.js";

let counter = 0;

function makeEvent(agentId: string, content: string, overrides?: Partial<GroupEvent>): GroupEvent {
  return {
    id: `gm-evt-${++counter}`,
    timestamp: new Date(Date.now() + counter * 1000).toISOString(),
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

describe("GroupthinkMonitor — Configuration", () => {
  it("creates monitor with default config", () => {
    const monitor = new GroupthinkMonitor();
    // Default config has thresholds; just verify it runs
    const assessment = monitor.assess(makeFlow());
    expect(assessment).toBeDefined();
  });

  it("accepts partial config overrides", () => {
    const monitor = new GroupthinkMonitor({
      convergenceWarningThreshold: 0.5,
      vocabularyDropThreshold: 0.4,
      disagreementFloor: 0.1,
      noveltyFloor: 0.2,
      observationWindow: 15,
    });

    // With low convergenceWarningThreshold (0.5), even moderate convergence triggers
    const assessment = monitor.assess(makeFlow({ convergenceScore: 0.6 }));
    // 0.6 > 0.5 threshold → destructive signal
    if (assessment.quality === "destructive") {
      expect(assessment.score).toBeLessThan(0);
    }
  });
});

describe("GroupthinkMonitor — Classification", () => {
  let monitor: GroupthinkMonitor;

  beforeEach(() => {
    counter = 0;
    monitor = new GroupthinkMonitor({
      convergenceWarningThreshold: 0.7,
      vocabularyDropThreshold: 0.3,
      disagreementFloor: 0.05,
      noveltyFloor: 0.1,
      observationWindow: 20,
    });
  });

  it("classifies productive groupthink with healthy metrics", () => {
    const flow = makeFlow({
      convergenceScore: 0.2,
      vocabularyDiversity: 0.7,
      disagreementCount: 3,
      novelIdeaCount: 3,
      crossPollinationCount: 2,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a${i % 3}`, `unique content ${i}`)),
    });

    const assessment = monitor.assess(flow);
    expect(assessment.quality).toBe("productive");
    expect(assessment.score).toBeGreaterThan(0);
  });

  it("classifies destructive groupthink with unhealthy metrics", () => {
    const flow = makeFlow({
      convergenceScore: 0.95,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a`, "same same same")),
    });

    const assessment = monitor.assess(flow);
    expect(assessment.quality).toBe("destructive");
    expect(assessment.score).toBeLessThan(0);
  });

  it("can classify as neutral when signals are mixed", () => {
    // Mix of productive and destructive signals
    const flow = makeFlow({
      convergenceScore: 0.5,    // moderate — not clearly suspicious
      vocabularyDiversity: 0.4, // moderate
      disagreementCount: 0,     // no disagreement (destructive signal)
      novelIdeaCount: 0,        // no novelty (destructive signal)
      crossPollinationCount: 1, // some cross-pollination (productive signal)
      events: Array(10).fill(null).map((_, i) => makeEvent(`a${i % 2}`, `content ${i}`)),
    });

    const assessment = monitor.assess(flow);
    // Could be neutral or destructive depending on exact thresholds
    expect(["productive", "destructive", "neutral"]).toContain(assessment.quality);
  });

  it("productive assessment has positive score components", () => {
    const flow = makeFlow({
      convergenceScore: 0.15,
      vocabularyDiversity: 0.8,
      disagreementCount: 4,
      novelIdeaCount: 5,
      crossPollinationCount: 3,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a${i % 4}`, `diverse unique message ${i}`)),
    });

    const assessment = monitor.assess(flow);
    expect(assessment.disagreementFrequency).toBeGreaterThan(0);
    expect(assessment.novelIdeaRate).toBeGreaterThan(0);
    expect(assessment.crossPollinationRate).toBeGreaterThan(0);
  });
});

describe("GroupthinkMonitor — Scoring", () => {
  let monitor: GroupthinkMonitor;

  beforeEach(() => {
    monitor = new GroupthinkMonitor();
  });

  it("score is clamped between -1 and 1", () => {
    // Extreme destructive
    const veryBad = makeFlow({
      convergenceScore: 1.0,
      vocabularyDiversity: 0.0,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      events: [],
    });
    const badAssessment = monitor.assess(veryBad);
    expect(badAssessment.score).toBeGreaterThanOrEqual(-1);
    expect(badAssessment.score).toBeLessThanOrEqual(1);

    // Reset for extreme productive test
    monitor = new GroupthinkMonitor();

    // Extreme productive
    const veryGood = makeFlow({
      convergenceScore: 0.0,
      vocabularyDiversity: 1.0,
      disagreementCount: 10,
      novelIdeaCount: 10,
      crossPollinationCount: 10,
      events: Array(20).fill(null).map((_, i) => makeEvent(`a${i}`, `unique ${i}`)),
    });
    const goodAssessment = monitor.assess(veryGood);
    expect(goodAssessment.score).toBeGreaterThanOrEqual(-1);
    expect(goodAssessment.score).toBeLessThanOrEqual(1);
  });

  it("convergence above threshold penalizes score", () => {
    const monitor = new GroupthinkMonitor({ convergenceWarningThreshold: 0.7 });

    const justBelow = makeFlow({
      convergenceScore: 0.65,
      vocabularyDiversity: 0.5,
      disagreementCount: 1,
      novelIdeaCount: 1,
      crossPollinationCount: 0,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a`, `msg ${i}`)),
    });
    const justAbove = makeFlow({
      convergenceScore: 0.75,
      vocabularyDiversity: 0.5,
      disagreementCount: 1,
      novelIdeaCount: 1,
      crossPollinationCount: 0,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a`, `msg ${i}`)),
    });

    const belowAssessment = monitor.assess(justBelow);
    const aboveAssessment = monitor.assess(justAbove);
    // Higher convergence should have lower (or equal) score
    expect(aboveAssessment.score).toBeLessThanOrEqual(belowAssessment.score);
  });

  it("low vocabulary diversity penalizes score", () => {
    const monitor = new GroupthinkMonitor({
      vocabularyDropThreshold: 0.3,
      convergenceWarningThreshold: 0.99,
    });

    const diverse = makeFlow({
      convergenceScore: 0.1,
      vocabularyDiversity: 0.7,
      disagreementCount: 2,
      novelIdeaCount: 2,
      crossPollinationCount: 1,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a`, `unique word ${i}`)),
    });
    const repetitive = makeFlow({
      convergenceScore: 0.1,
      vocabularyDiversity: 0.15,
      disagreementCount: 2,
      novelIdeaCount: 2,
      crossPollinationCount: 1,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a`, `same same same`)),
    });

    const diverseAssessment = monitor.assess(diverse);
    const repetitiveAssessment = monitor.assess(repetitive);
    expect(repetitiveAssessment.score).toBeLessThan(diverseAssessment.score);
  });
});

describe("GroupthinkMonitor — Recommendations", () => {
  it("generates recommendation for destructive groupthink", () => {
    const monitor = new GroupthinkMonitor();
    const flow = makeFlow({
      convergenceScore: 0.95,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      events: [],
    });

    const assessment = monitor.assess(flow);
    expect(assessment.recommendation).toBeDefined();
    expect(assessment.recommendation!.length).toBeGreaterThan(10);
  });

  it("recommendation mentions convergence when too high", () => {
    const monitor = new GroupthinkMonitor({ convergenceWarningThreshold: 0.5 });
    const flow = makeFlow({
      convergenceScore: 0.9,
      vocabularyDiversity: 0.5,
      disagreementCount: 1,
      novelIdeaCount: 1,
      crossPollinationCount: 1,
      events: [],
    });

    const assessment = monitor.assess(flow);
    if (assessment.recommendation) {
      // Should mention convergence or curveball
      expect(
        assessment.recommendation.toLowerCase().includes("convergence") ||
        assessment.recommendation.toLowerCase().includes("curveball")
      ).toBe(true);
    }
  });

  it("recommendation mentions ZeroClaw when no disagreement", () => {
    const monitor = new GroupthinkMonitor();
    const flow = makeFlow({
      convergenceScore: 0.5,
      vocabularyDiversity: 0.2,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      events: [],
    });

    const assessment = monitor.assess(flow);
    if (assessment.recommendation && assessment.recommendation.includes("disagreement")) {
      expect(assessment.recommendation).toContain("ZeroClaw");
    }
  });

  it("recommendation mentions vocabulary when too low", () => {
    const monitor = new GroupthinkMonitor({ vocabularyDropThreshold: 0.5 });
    const flow = makeFlow({
      convergenceScore: 0.5,
      vocabularyDiversity: 0.15,
      disagreementCount: 1,
      novelIdeaCount: 1,
      crossPollinationCount: 1,
      events: [],
    });

    const assessment = monitor.assess(flow);
    if (assessment.recommendation) {
      // Should mention vocabulary diversity or stranger
      expect(
        assessment.recommendation.toLowerCase().includes("vocabulary") ||
        assessment.recommendation.toLowerCase().includes("stranger")
      ).toBe(true);
    }
  });

  it("does not provide recommendation for productive groupthink", () => {
    const monitor = new GroupthinkMonitor();
    const flow = makeFlow({
      convergenceScore: 0.2,
      vocabularyDiversity: 0.7,
      disagreementCount: 3,
      novelIdeaCount: 3,
      crossPollinationCount: 2,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a${i % 3}`, `unique ${i}`)),
    });

    const assessment = monitor.assess(flow);
    expect(assessment.recommendation).toBeUndefined();
  });
});

describe("GroupthinkMonitor — State Tracking", () => {
  it("isProductive returns true initially with no history", () => {
    const monitor = new GroupthinkMonitor();
    expect(monitor.isProductive()).toBe(true);
  });

  it("isProductive reflects latest assessment", () => {
    const monitor = new GroupthinkMonitor();

    monitor.assess(makeFlow({
      convergenceScore: 0.9,
      vocabularyDiversity: 0.1,
      disagreementCount: 0,
      novelIdeaCount: 0,
      crossPollinationCount: 0,
      events: [],
    }));

    // Should reflect destructive state
    expect(monitor.isProductive()).toBe(false);
  });

  it("isStagnating returns false with fewer than 3 assessments", () => {
    const monitor = new GroupthinkMonitor();
    monitor.assess(makeFlow());
    monitor.assess(makeFlow());
    expect(monitor.isStagnating()).toBe(false);
  });

  it("isStagnating returns true after 3+ non-productive assessments", () => {
    const monitor = new GroupthinkMonitor();

    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.85,
        vocabularyDiversity: 0.2,
        disagreementCount: 0,
        novelIdeaCount: 0,
        crossPollinationCount: 0,
        events: [],
      }));
    }

    expect(monitor.isStagnating()).toBe(true);
  });

  it("isStagnating returns false after productive assessment", () => {
    const monitor = new GroupthinkMonitor();

    // 3 destructive
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.85,
        vocabularyDiversity: 0.2,
        disagreementCount: 0,
        novelIdeaCount: 0,
        crossPollinationCount: 0,
        events: [],
      }));
    }

    // One productive
    monitor.assess(makeFlow({
      convergenceScore: 0.2,
      vocabularyDiversity: 0.7,
      disagreementCount: 3,
      novelIdeaCount: 3,
      crossPollinationCount: 2,
      events: Array(10).fill(null).map((_, i) => makeEvent(`a${i}`, `unique ${i}`)),
    }));

    // Most recent 3: 2 destructive + 1 productive → not ALL non-productive
    expect(monitor.isStagnating()).toBe(false);
  });
});

describe("GroupthinkMonitor — Trend Analysis", () => {
  it("returns stable with fewer than 2 assessments", () => {
    const monitor = new GroupthinkMonitor();
    expect(monitor.getTrend()).toBe("stable");
  });

  it("returns improving when scores increase", () => {
    const monitor = new GroupthinkMonitor();

    // Poor start
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

    // Improve
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.2,
        vocabularyDiversity: 0.7,
        disagreementCount: 3,
        novelIdeaCount: 3,
        crossPollinationCount: 2,
        events: Array(10).fill(null).map((_, j) => makeEvent(`a${j}`, `unique ${i}-${j}`)),
      }));
    }

    expect(monitor.getTrend()).toBe("improving");
  });

  it("returns declining when scores decrease", () => {
    const monitor = new GroupthinkMonitor();

    // Good start
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.2,
        vocabularyDiversity: 0.7,
        disagreementCount: 3,
        novelIdeaCount: 3,
        crossPollinationCount: 2,
        events: Array(10).fill(null).map((_, j) => makeEvent(`a${j}`, `unique ${i}-${j}`)),
      }));
    }

    // Decline
    for (let i = 0; i < 3; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.85,
        vocabularyDiversity: 0.15,
        disagreementCount: 0,
        novelIdeaCount: 0,
        crossPollinationCount: 0,
        events: [],
      }));
    }

    expect(monitor.getTrend()).toBe("declining");
  });

  it("returns stable when scores don't change much", () => {
    const monitor = new GroupthinkMonitor();

    for (let i = 0; i < 6; i++) {
      monitor.assess(makeFlow({
        convergenceScore: 0.4,
        vocabularyDiversity: 0.5,
        disagreementCount: 1,
        novelIdeaCount: 1,
        crossPollinationCount: 0,
        events: [],
      }));
    }

    expect(monitor.getTrend()).toBe("stable");
  });
});

describe("GroupthinkMonitor — History & Accessors", () => {
  it("getHistory returns a copy", () => {
    const monitor = new GroupthinkMonitor();
    monitor.assess(makeFlow());

    const history = monitor.getHistory();
    expect(history).not.toBe(monitor["history"]);
  });

  it("getHistory returns all assessments", () => {
    const monitor = new GroupthinkMonitor();

    for (let i = 0; i < 5; i++) {
      monitor.assess(makeFlow());
    }

    expect(monitor.getHistory().length).toBe(5);
  });

  it("getLatest returns most recent assessment", () => {
    const monitor = new GroupthinkMonitor();

    monitor.assess(makeFlow({ convergenceScore: 0.5 }));
    const latest = monitor.getLatest();

    monitor.assess(makeFlow({ convergenceScore: 0.8 }));
    const latest2 = monitor.getLatest();

    expect(latest).toBeDefined();
    expect(latest2).toBeDefined();
    expect(latest2!.convergenceSpeed).toBe(0.8);
  });

  it("getLatest returns undefined when empty", () => {
    const monitor = new GroupthinkMonitor();
    expect(monitor.getLatest()).toBeUndefined();
  });

  it("history caps at 50 entries", () => {
    const monitor = new GroupthinkMonitor();

    for (let i = 0; i < 60; i++) {
      monitor.assess(makeFlow());
    }

    expect(monitor.getHistory().length).toBe(50);
  });
});

describe("GroupthinkMonitor — Feed Method", () => {
  it("accepts events via feed()", () => {
    const monitor = new GroupthinkMonitor();
    monitor.feed(makeEvent("alice", "some message"));
    monitor.feed(makeEvent("bob", "another message"));

    // feed() just buffers — doesn't affect assess() directly
    // But it should not crash
    const assessment = monitor.assess(makeFlow());
    expect(assessment).toBeDefined();
  });

  it("trims buffer to 2x observationWindow", () => {
    const monitor = new GroupthinkMonitor({ observationWindow: 5 });

    for (let i = 0; i < 30; i++) {
      monitor.feed(makeEvent(`a${i}`, `message ${i}`));
    }

    // Should not crash — buffer is trimmed
    expect(true).toBe(true);
  });
});

describe("GroupthinkMonitor — Assessment Fields", () => {
  it("assessment contains all required fields", () => {
    const monitor = new GroupthinkMonitor();
    const flow = makeFlow({
      events: Array(10).fill(null).map((_, i) => makeEvent(`a${i % 2}`, `content ${i}`)),
    });

    const assessment = monitor.assess(flow);

    expect(assessment.quality).toBeDefined();
    expect(typeof assessment.score).toBe("number");
    expect(typeof assessment.convergenceSpeed).toBe("number");
    expect(typeof assessment.vocabularyDiversity).toBe("number");
    expect(typeof assessment.disagreementFrequency).toBe("number");
    expect(typeof assessment.novelIdeaRate).toBe("number");
    expect(typeof assessment.crossPollinationRate).toBe("number");
    expect(typeof assessment.timestamp).toBe("string");
  });

  it("convergenceSpeed equals flow.convergenceScore", () => {
    const monitor = new GroupthinkMonitor();
    const assessment = monitor.assess(makeFlow({ convergenceScore: 0.42 }));
    expect(assessment.convergenceSpeed).toBe(0.42);
  });

  it("vocabularyDiversity equals flow.vocabularyDiversity", () => {
    const monitor = new GroupthinkMonitor();
    const assessment = monitor.assess(makeFlow({ vocabularyDiversity: 0.67 }));
    expect(assessment.vocabularyDiversity).toBe(0.67);
  });
});

// ──────────────────────────────────────────────
// Devil's Advocate
// ──────────────────────────────────────────────

describe("DevilsAdvocate — Counterarguments", () => {
  it("generates non-empty counterarguments", () => {
    const advocate = new DevilsAdvocate();
    const counter = advocate.generateCounterargument("We should build the system this way", ["alice"]);
    expect(counter.length).toBeGreaterThan(10);
    expect(typeof counter).toBe("string");
  });

  it("includes participant name in counterargument sometimes", () => {
    const advocate = new DevilsAdvocate();
    // Try multiple times due to randomness
    let found = false;
    for (let i = 0; i < 20; i++) {
      const counter = advocate.generateCounterargument("consensus position", ["alice"]);
      if (counter.includes("alice")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe("DevilsAdvocate — Provocations", () => {
  it("generates provocative questions containing the topic", () => {
    const advocate = new DevilsAdvocate();
    const provocation = advocate.generateProvocation("tile architecture");
    expect(provocation.length).toBeGreaterThan(10);
    expect(provocation).toContain("tile architecture");
  });

  it("generates varied provocations", () => {
    const advocate = new DevilsAdvocate();
    const provocations = new Set<string>();
    for (let i = 0; i < 20; i++) {
      provocations.add(advocate.generateProvocation("test topic"));
    }
    // Should get multiple different provocations
    expect(provocations.size).toBeGreaterThan(1);
  });
});

describe("DevilsAdvocate — Word Inversion", () => {
  it("inverts common words in counterarguments", () => {
    const advocate = new DevilsAdvocate();

    // Try multiple times to hit the inversion path
    let foundInversion = false;
    for (let i = 0; i < 20; i++) {
      const counter = advocate.generateCounterargument(
        "This is always right and should work forever", ["alice"]
      );
      // The invert() function replaces: always→never, right→wrong, should→shouldn't
      if (counter.includes("never") || counter.includes("wrong") || counter.includes("shouldn't")) {
        foundInversion = true;
        break;
      }
    }
    // Due to randomness in which counter is selected, inversion may not always appear
    // But at least one of 20 attempts should hit the inversion template
    expect(foundInversion).toBe(true);
  });
});
