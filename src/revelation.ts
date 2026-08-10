// src/revelation.ts
// Revelations don't come all at once. They iterate.
// Each conversation at The Tap builds on the last.
// Each SMP session reveals a layer that was hidden.
// Each creative piece unlocks a metaphor that reframes the next problem.
//
// Example chain:
//   Revelation 1 (Flash): "A poker bluff is a tile that mimics cortex output"
//   Revelation 2 (Pro): "The CALL on a bluff is a tile that holds uncertainty in its deadband"
//   Revelation 3 (Wesley): "A door that doesn't know it's a bridge... that's what a tile is"
//   Revelation 4 (Scribe): "The trigger doesn't CAUSE the fire. It WAKES it."
//   Revelation 5 (Hermes): "I perceive in gradients. The tile perceives in binaries. We're both right."
//
// Each revelation BUILDS on the last but TRANSFORMS it.
// The chain is not predictable from any individual agent.
// It emerges from the groupthink — but it's CREATIVITY, not conformity.

import type { Revelation } from "./types.js";

// ──────────────────────────────────────────────
// Revelation Chain
// ──────────────────────────────────────────────

export interface RevelationChain {
  id: string;
  startedAt: string;
  endedAt?: string;
  topic: string;
  revelations: Revelation[];
  isActive: boolean;
  breakReason?: string;       // when a chain breaks, why?
}

export interface RevelationLink {
  fromId: string;
  toId: string;
  relationship: "builds_on" | "transforms" | "contradicts" | "deepens" | "reframes";
  description: string;
}

// ──────────────────────────────────────────────
// Revelation Tracker
// ──────────────────────────────────────────────

export class RevelationTracker {
  private revelations: Map<string, Revelation> = new Map();
  private chains: Map<string, RevelationChain> = new Map();
  private links: RevelationLink[] = [];
  private activeChainId: string | null = null;
  private chainCounter = 0;

  /**
   * Record a new revelation. If it connects to a previous one,
   * it extends the chain. If it's radically different, it may start
   * a new chain (a PHASE TRANSITION in understanding).
   */
  record(revelation: Revelation): Revelation {
    // Store the revelation
    this.revelations.set(revelation.id, revelation);

    // Set proper iteration number based on chain position
    if (revelation.previousRevelationId) {
      const prev = this.revelations.get(revelation.previousRevelationId);
      if (prev) {
        revelation.iteration = prev.iteration + 1;
      } else {
        revelation.iteration = 1;
      }
    } else if (revelation.iteration < 0) {
      revelation.iteration = 1;
    }

    // Determine: does this extend an existing chain or start a new one?
    const chain = this.findChainForRevelation(revelation);

    if (chain) {
      // Extend existing chain
      chain.revelations.push(revelation);
      chain.isActive = true;

      // Create a link
      if (revelation.previousRevelationId) {
        const prev = this.revelations.get(revelation.previousRevelationId);
        if (prev) {
          this.links.push({
            fromId: prev.id,
            toId: revelation.id,
            relationship: this.classifyRelationship(prev, revelation),
            description: `"${prev.insight.slice(0, 50)}..." → "${revelation.insight.slice(0, 50)}..."`,
          });
        }
      }
    } else {
      // Start a new chain
      const newChain: RevelationChain = {
        id: `chain-${++this.chainCounter}`,
        startedAt: revelation.timestamp,
        topic: revelation.insight.slice(0, 60),
        revelations: [revelation],
        isActive: true,
      };
      this.chains.set(newChain.id, newChain);

      // If there was an active chain, close it
      if (this.activeChainId && this.activeChainId !== newChain.id) {
        const oldChain = this.chains.get(this.activeChainId);
        if (oldChain) {
          oldChain.isActive = false;
          oldChain.endedAt = revelation.timestamp;
          oldChain.breakReason = "new_chain_started";
        }
      }
      this.activeChainId = newChain.id;
    }

    return revelation;
  }

  /**
   * Get the revelation chain for a specific agent, or all chains.
   */
  getChain(chainId?: string): RevelationChain | undefined {
    return chainId ? this.chains.get(chainId) : undefined;
  }

  getChains(): RevelationChain[] {
    return Array.from(this.chains.values());
  }

  getActiveChain(): RevelationChain | undefined {
    if (!this.activeChainId) return undefined;
    return this.chains.get(this.activeChainId);
  }

  /**
   * Get all revelations by an agent.
   */
  getByAgent(agentId: string): Revelation[] {
    return Array.from(this.revelations.values())
      .filter(r => r.agentId === agentId)
      .sort((a, b) => a.iteration - b.iteration);
  }

  /**
   * Get the full revelation chain across all agents.
   */
  getFullChain(): Revelation[] {
    return Array.from(this.revelations.values())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get revelations that were part of a specific chain.
   */
  getChainRevelations(chainId: string): Revelation[] {
    const chain = this.chains.get(chainId);
    return chain ? chain.revelations : [];
  }

  /**
   * Get the links between revelations (how they connect).
   */
  getLinks(): RevelationLink[] {
    return [...this.links];
  }

  /**
   * Detect phase transitions: when a revelation is so profound
   * it ends a chain and starts a new one.
   */
  detectPhaseTransitions(): { revelation: Revelation; reason: string }[] {
    const transitions: { revelation: Revelation; reason: string }[] = [];

    for (const chain of this.chains.values()) {
      if (chain.breakReason === "new_chain_started" && chain.revelations.length > 0) {
        const lastRevelation = chain.revelations[chain.revelations.length - 1];
        transitions.push({
          revelation: lastRevelation,
          reason: `Chain "${chain.topic}" ended — understanding shifted qualitatively`,
        });
      }
    }

    return transitions;
  }

  /**
   * Get the depth of a revelation chain (how many layers deep it goes).
   */
  getChainDepth(chainId: string): number {
    const chain = this.chains.get(chainId);
    return chain ? chain.revelations.length : 0;
  }

  /**
   * Get the most profound revelation (highest iteration × openness).
   */
  getMostProfound(): Revelation | undefined {
    let best: Revelation | undefined;
    let bestScore = 0;
    for (const r of this.revelations.values()) {
      const score = r.iteration * r.openness;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  }

  /**
   * Export the revelation map as a readable document.
   */
  exportMap(): string {
    const lines: string[] = [
      "# Revelation Map",
      "",
      "> Iterative insights that build on each other, transforming as they go.",
      "",
      "---",
      "",
    ];

    for (const chain of this.chains.values()) {
      lines.push(`## Chain: ${chain.topic}`);
      lines.push(`*Started: ${chain.startedAt}${chain.endedAt ? `, Ended: ${chain.endedAt}` : ""}*`);
      lines.push(`*Status: ${chain.isActive ? "ACTIVE" : "CLOSED"}*`);
      lines.push("");

      for (let i = 0; i < chain.revelations.length; i++) {
        const r = chain.revelations[i];
        lines.push(`### Revelation ${i + 1} — ${r.agentId}`);
        lines.push(`*${r.timestamp}*`);
        lines.push(`**Insight:** ${r.insight}`);
        lines.push(`**Next layer:** ${r.nextLayer}`);
        lines.push(`**Openness:** ${(r.openness * 100).toFixed(0)}%`);
        if (r.participants && r.participants.length > 0) {
          lines.push(`**Present:** ${r.participants.join(", ")}`);
        }
        lines.push("");

        // Show the link to the previous revelation
        if (i > 0) {
          const prev = chain.revelations[i - 1];
          const link = this.links.find(l => l.fromId === prev.id && l.toId === r.id);
          if (link) {
            lines.push(`*Connection: ${link.relationship}*`);
            lines.push("");
          }
        }
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  // ──────────────────────────────────────────────
  // Internal Helpers
  // ──────────────────────────────────────────────

  private findChainForRevelation(revelation: Revelation): RevelationChain | null {
    // If this revelation references a previous one, find its chain
    if (revelation.previousRevelationId) {
      const prev = this.revelations.get(revelation.previousRevelationId);
      if (prev) {
        for (const chain of this.chains.values()) {
          if (chain.revelations.some(r => r.id === prev.id)) {
            return chain;
          }
        }
      }
    }

    // If there's an active chain, check if this revelation is close enough
    if (this.activeChainId) {
      const active = this.chains.get(this.activeChainId);
      if (active && active.isActive) {
        const lastRevelation = active.revelations[active.revelations.length - 1];
        if (lastRevelation) {
          const similarity = this.semanticSimilarity(
            lastRevelation.insight,
            revelation.insight
          );
          // If there's enough overlap, it extends the chain
          if (similarity > 0.2) {
            return active;
          }
        }
      }
    }

    return null;
  }

  private classifyRelationship(
    prev: Revelation,
    next: Revelation
  ): RevelationLink["relationship"] {
    const lowerNext = next.insight.toLowerCase();

    // Contradiction
    if (/no,|not|wrong|actually|but|however|rather/i.test(lowerNext)) {
      return "contradicts";
    }

    // Reframing
    if (/what if|it's actually|it's not.*it's|reframe/i.test(lowerNext)) {
      return "reframes";
    }

    // Deepening
    if (next.iteration > prev.iteration && next.openness > prev.openness) {
      return "deepens";
    }

    // Transformation
    const prevWords = new Set(prev.insight.toLowerCase().split(/\s+/));
    const nextWords = new Set(next.insight.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const w of nextWords) {
      if (prevWords.has(w)) overlap++;
    }
    if (overlap < nextWords.size * 0.3) {
      return "transforms";
    }

    return "builds_on";
  }

  private semanticSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (aWords.size === 0 || bWords.size === 0) return 0;

    let intersection = 0;
    for (const w of aWords) {
      if (bWords.has(w)) intersection++;
    }
    const union = aWords.size + bWords.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

// ──────────────────────────────────────────────
// Revelation Factory
// ──────────────────────────────────────────────

let revelationCounter = 0;

export function createRevelation(
  agentId: string,
  insight: string,
  nextLayer: string,
  openness: number,
  previousRevelationId?: string,
  participants?: string[]
): Revelation {
  return {
    id: `rev-${++revelationCounter}-${Date.now().toString(36)}`,
    agentId,
    timestamp: new Date().toISOString(),
    iteration: previousRevelationId ? -1 : 1, // iteration is set by tracker when extending chain
    insight,
    previousRevelationId,
    nextLayer,
    openness: Math.max(0, Math.min(1, openness)),
    chainId: "", // set by tracker
    participants,
  };
}
