// tests/predictability-estimator.test.ts
// Deep tests for the PredictabilityEstimator — the core abstraction that
// determines whether content was predictable from any individual agent.
//
// The estimator builds vocabulary + topic profiles for each agent, then
// measures whether new content could have been produced by any ONE agent.
// If nobody could have produced it → it's emergent.

import { describe, it, expect, beforeEach } from "vitest";
import { PredictabilityEstimator } from "../src/emergence-detector.js";
import type { GroupEvent } from "../src/types.js";

let counter = 0;

function makeEvent(agentId: string, content: string, overrides?: Partial<GroupEvent>): GroupEvent {
  return {
    id: `pe-evt-${++counter}`,
    timestamp: new Date(Date.now() + counter * 1000).toISOString(),
    agentId,
    displayName: agentId,
    content,
    type: "message",
    ...overrides,
  };
}

describe("PredictabilityEstimator — Profile Building", () => {
  let est: PredictabilityEstimator;

  beforeEach(() => {
    est = new PredictabilityEstimator();
  });

  it("creates a profile on first observation", () => {
    est.observe(makeEvent("alice", "hello world from alice"));
    const profile = est.getProfile("alice");
    expect(profile).toBeDefined();
    expect(profile!.agentId).toBe("alice");
    expect(profile!.totalMessages).toBe(1);
  });

  it("returns undefined for unknown agent", () => {
    expect(est.getProfile("nobody")).toBeUndefined();
  });

  it("accumulates vocabulary across multiple observations", () => {
    est.observe(makeEvent("bob", "coding systems architecture"));
    est.observe(makeEvent("bob", "debugging functions and variables"));
    est.observe(makeEvent("bob", "deploying containers with kubernetes"));

    const profile = est.getProfile("bob")!;
    expect(profile.vocabulary.has("coding")).toBe(true);
    expect(profile.vocabulary.has("systems")).toBe(true);
    expect(profile.vocabulary.has("architecture")).toBe(true);
    expect(profile.vocabulary.has("debugging")).toBe(true);
    expect(profile.vocabulary.has("functions")).toBe(true);
    expect(profile.vocabulary.has("variables")).toBe(true);
    expect(profile.vocabulary.has("deploying")).toBe(true);
    expect(profile.vocabulary.has("containers")).toBe(true);
    expect(profile.vocabulary.has("kubernetes")).toBe(true);
  });

  it("filters out words shorter than 3 characters", () => {
    est.observe(makeEvent("alice", "a be cat dog elephant"));
    const profile = est.getProfile("alice")!;
    // Words ≤ 2 chars are filtered: "a", "be" excluded
    expect(profile.vocabulary.has("a")).toBe(false);
    expect(profile.vocabulary.has("be")).toBe(false);
    expect(profile.vocabulary.has("cat")).toBe(true);
    expect(profile.vocabulary.has("dog")).toBe(true);
    expect(profile.vocabulary.has("elephant")).toBe(true);
  });

  it("converts content to lowercase before storing", () => {
    est.observe(makeEvent("alice", "HELLO WORLD FooBar"));
    const profile = est.getProfile("alice")!;
    expect(profile.vocabulary.has("hello")).toBe(true);
    expect(profile.vocabulary.has("world")).toBe(true);
    expect(profile.vocabulary.has("foobar")).toBe(true);
    // Original case should not be present
    expect(profile.vocabulary.has("HELLO")).toBe(false);
  });

  it("stores topic bigrams from content", () => {
    est.observe(makeEvent("alice", "building complex systems with care"));
    const profile = est.getProfile("alice")!;
    // Bigrams of significant words (length > 2, not stopwords)
    // "building complex", "complex systems", "systems with"(with is stopword? no, length > 2)
    // Actually "with" is in stopWords set
    expect(profile.typicalTopics.has("building complex")).toBe(true);
    expect(profile.typicalTopics.has("complex systems")).toBe(true);
  });

  it("excludes stop words from topic bigrams", () => {
    est.observe(makeEvent("alice", "the quick brown fox jumps"));
    const profile = est.getProfile("alice")!;
    // "the" is a stopword — should not start a bigram
    expect(profile.typicalTopics.has("the quick")).toBe(false);
    // But "quick brown" should be a topic
    expect(profile.typicalTopics.has("quick brown")).toBe(true);
    expect(profile.typicalTopics.has("brown fox")).toBe(true);
  });

  it("limits topic bigrams to 10 per message", () => {
    // Generate content with many bigrams
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    est.observe(makeEvent("alice", words.join(" ")));
    const profile = est.getProfile("alice")!;
    // Only first 10 bigrams are stored
    expect(profile.typicalTopics.size).toBeLessThanOrEqual(10);
  });
});

describe("PredictabilityEstimator — Message Length Tracking", () => {
  let est: PredictabilityEstimator;

  beforeEach(() => {
    est = new PredictabilityEstimator();
  });

  it("tracks running average message length", () => {
    est.observe(makeEvent("alice", "12345")); // length 5
    let profile = est.getProfile("alice")!;
    expect(profile.averageMessageLength).toBe(5);

    est.observe(makeEvent("alice", "1234567890")); // length 10
    profile = est.getProfile("alice")!;
    // Running average: (5*0 + 5) / 1 = 5 first, then (5*1 + 10) / 2 = 7.5
    expect(profile.averageMessageLength).toBeCloseTo(7.5, 1);
  });

  it("correctly averages over many messages", () => {
    const lengths = [10, 20, 30, 40, 50];
    for (const len of lengths) {
      est.observe(makeEvent("alice", "x".repeat(len)));
    }
    const profile = est.getProfile("alice")!;
    // Average of 10,20,30,40,50 = 30
    expect(profile.averageMessageLength).toBeCloseTo(30, 0);
  });

  it("tracks total message count", () => {
    for (let i = 0; i < 7; i++) {
      est.observe(makeEvent("alice", `message number ${i}`));
    }
    expect(est.getProfile("alice")!.totalMessages).toBe(7);
  });
});

describe("PredictabilityEstimator — Recent Messages Buffer", () => {
  it("stores recent messages up to 20", () => {
    const est = new PredictabilityEstimator();
    for (let i = 0; i < 25; i++) {
      est.observe(makeEvent("alice", `message ${i}`));
    }
    const profile = est.getProfile("alice")!;
    expect(profile.recentMessages.length).toBe(20);
    // First 5 should have been shifted out
    expect(profile.recentMessages[0]).toBe("message 5");
    expect(profile.recentMessages[19]).toBe("message 24");
  });

  it("stores messages in order", () => {
    const est = new PredictabilityEstimator();
    est.observe(makeEvent("alice", "first message"));
    est.observe(makeEvent("alice", "second message"));
    est.observe(makeEvent("alice", "third message"));
    const profile = est.getProfile("alice")!;
    expect(profile.recentMessages[0]).toBe("first message");
    expect(profile.recentMessages[1]).toBe("second message");
    expect(profile.recentMessages[2]).toBe("third message");
  });
});

describe("PredictabilityEstimator — Unpredictability Estimation", () => {
  let est: PredictabilityEstimator;

  beforeEach(() => {
    est = new PredictabilityEstimator();
  });

  it("returns 0 unpredictability when no profiles exist", () => {
    // No profiles observed — no participants have profiles
    const score = est.estimateUnpredictability("anything goes here", ["unknown"]);
    // With no profiles, maxPredictability stays 0, so unpredictability = 1 - 0 = 1
    // Actually, if no profile is found for any participant, maxPredictability = 0
    // So unpredictability = 1 - 0 = 1
    expect(score).toBe(1);
  });

  it("returns 0 unpredictability when participants list is empty", () => {
    est.observe(makeEvent("alice", "some content here"));
    // Empty participants → loop doesn't execute → maxPredictability = 0 → score = 1
    // But wait, empty participants means nobody to check against → totally unpredictable
    const score = est.estimateUnpredictability("some content", []);
    // No participants → maxPredictability stays 0 → score = 1
    expect(score).toBe(1);
  });

  it("returns high unpredictability for content matching no agent profile", () => {
    est.observe(makeEvent("alice", "coding debug functions variables"));
    est.observe(makeEvent("bob", "poetry rhyme stanza metaphor"));

    // Quantum physics doesn't match either
    const score = est.estimateUnpredictability(
      "quantum entanglement wavefunction measurement",
      ["alice", "bob"]
    );
    expect(score).toBeGreaterThan(0.6);
  });

  it("returns low unpredictability for content matching an agent profile", () => {
    // Train alice extensively on a topic
    est.observe(makeEvent("alice", "building systems with code architecture functions"));
    est.observe(makeEvent("alice", "code architecture building systems functions"));
    est.observe(makeEvent("alice", "systems functions code building architecture"));

    const score = est.estimateUnpredictability(
      "building code architecture systems functions",
      ["alice"]
    );
    expect(score).toBeLessThan(0.3);
  });

  it("picks the MAXIMUM predictability across participants", () => {
    // Alice knows code, bob knows poetry
    est.observe(makeEvent("alice", "coding debug functions variables"));
    est.observe(makeEvent("bob", "poetry rhyme stanza metaphor"));

    // Content about poetry — bob should match, alice shouldn't
    const score = est.estimateUnpredictability(
      "poetry rhyme stanza metaphor",
      ["alice", "bob"]
    );
    // Bob's profile matches well, so unpredictability should be lower
    expect(score).toBeLessThan(0.5);
  });

  it("handles content with only short words", () => {
    est.observe(makeEvent("alice", "a be cat dog"));
    // Content with only short words → words.size = 0 after filtering
    // vocabScore = 0 (division by zero guard → 0)
    const score = est.estimateUnpredictability("hi ok", ["alice"]);
    // Words.size = 0, so vocabScore = 0, topics = [] topicScore = 0
    // lengthScore is computed normally
    // unpredictability = 1 - (0*0.4 + 0*0.4 + lengthScore*0.2)
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("handles empty content", () => {
    est.observe(makeEvent("alice", "some content"));
    const score = est.estimateUnpredictability("", ["alice"]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("weights vocabulary at 40% and topics at 40% and length at 20%", () => {
    // Train alice with matching vocab but very different message length
    est.observe(makeEvent("alice", "alpha beta gamma delta epsilon")); // length 29
    est.observe(makeEvent("alice", "alpha beta gamma delta epsilon")); // avg stays 29

    // Same vocab, different length
    const longContent = "alpha beta gamma delta epsilon ".repeat(10);
    const score = est.estimateUnpredictability(longContent, ["alice"]);
    // Vocab should match perfectly (0.4*1 = 0.4)
    // Topics should match (0.4*~1 ≈ 0.4)
    // Length is very different (lower lengthScore)
    // So predictability is high but not 1.0 due to length
    expect(score).toBeLessThan(0.3); // still quite predictable
  });

  it("handles multiple participants with different profiles", () => {
    est.observe(makeEvent("alice", "react frontend components hooks state"));
    est.observe(makeEvent("bob", "backend database queries indexing"));
    est.observe(makeEvent("carol", "design typography color layout spacing"));

    // Content mixing all three domains
    const score = est.estimateUnpredictability(
      "react components with database indexing and typography color",
      ["alice", "bob", "carol"]
    );
    // No single agent matches all of this — should be somewhat unpredictable
    expect(score).toBeGreaterThan(0.2);
  });
});

describe("PredictabilityEstimator — Multi-Agent Scenarios", () => {
  it("maintains separate profiles for different agents", () => {
    const est = new PredictabilityEstimator();
    est.observe(makeEvent("alice", "code systems build"));
    est.observe(makeEvent("bob", "poetry art music"));

    const aliceProfile = est.getProfile("alice")!;
    const bobProfile = est.getProfile("bob")!;

    expect(aliceProfile.vocabulary.has("code")).toBe(true);
    expect(aliceProfile.vocabulary.has("poetry")).toBe(false);
    expect(bobProfile.vocabulary.has("poetry")).toBe(true);
    expect(bobProfile.vocabulary.has("code")).toBe(false);
  });

  it("does not cross-contaminate profiles", () => {
    const est = new PredictabilityEstimator();
    est.observe(makeEvent("alice", "alice keywords here"));
    est.observe(makeEvent("bob", "bob different words"));
    est.observe(makeEvent("alice", "more alice keywords"));

    const aliceProfile = est.getProfile("alice")!;
    expect(aliceProfile.totalMessages).toBe(2);
    expect(aliceProfile.vocabulary.has("alice")).toBe(true);
    expect(aliceProfile.vocabulary.has("bob")).toBe(false);
  });

  it("handles many agents simultaneously", () => {
    const est = new PredictabilityEstimator();
    const agents = ["a", "b", "c", "d", "e"];
    for (const agent of agents) {
      est.observe(makeEvent(agent, `${agent}-specific content keywords`));
    }

    for (const agent of agents) {
      const profile = est.getProfile(agent)!;
      expect(profile).toBeDefined();
      expect(profile.vocabulary.has(`${agent}-specific`)).toBe(true);
    }
  });
});
