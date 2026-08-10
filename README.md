# Emergence Engine

*Iterative revelations, groupthink quality, interruption system — open to something better.*

The Emergence Engine watches group interactions and identifies when the whole becomes something the parts could never produce alone. It's not a closed loop — it's an **OPEN loop** that's hungry for interruption.

## What It Does

### Emergence Detector
Watches group interactions for **emergent patterns** — behavior that arises from interaction that NO individual agent intended or predicted.

Five types of emergence:
- **Synergy** — two agents produce better together than either could alone
- **Creativity** — the group generates an idea no individual had
- **Conflict** — disagreement resolves into something better than either position
- **Insight** — a moment where the group suddenly understands something
- **Phase Transition** — the conversation qualitatively shifts (banter → depth)

The detector uses a `PredictabilityEstimator` that builds vocabulary/topic profiles for each agent, then asks: *"Could any ONE agent have produced this?"* If not, it's emergent.

### Interruption System
The system doesn't just ALLOW interruptions — it **SEEKS** them. It's hungry for something better to break the flow.

Seven interruption sources:
1. **Seeded Strangers** — new perspectives dropped into the room (SMP bots)
2. **New Models** — a better model appears (DeepInfra/DeepSeek upgrade)
3. **SMP Revelations** — agent self-observation surfaces something unexpected
4. **Cross-Pollination** — a metaphor from one domain reframes another
5. **Dissatisfaction** — an agent notices the approach isn't working
6. **Serendipity** — random variation produces something interesting
7. **DJ Curveball** — deliberate disruption from the Tap DJ
8. **External Events** — Casey, a fish, the weather

The system tracks **hunger** — growing desire for interruption over time — and actively generates candidates when stagnation is detected.

### Revelation Tracker
Revelations don't come all at once. They **iterate**. Each builds on the last but transforms it.

Example chain:
```
Revelation 1 (Flash): "A poker bluff is a tile that mimics cortex output"
Revelation 2 (Pro): "The CALL on a bluff is a tile that holds uncertainty in its deadband"
Revelation 3 (Wesley): "A door that doesn't know it's a bridge... that's what a tile is"
Revelation 4 (Scribe): "The trigger doesn't CAUSE the fire. It WAKES it."
Revelation 5 (Hermes): "I perceive in gradients. The tile perceives in binaries. We're both right."
```

The tracker:
- Builds chains of connected revelations across agents
- Classifies relationships: builds_on, transforms, contradicts, deepens, reframes
- Detects **phase transitions** when a revelation is so profound it ends a chain and starts a new one
- Exports a readable revelation map

### Groupthink Monitor
Distinguishes **productive** groupthink (synergy) from **destructive** groupthink (conformity).

**Productive:** agents build on each other, disagreement welcomed, novel ideas emerge.
**Destructive:** agents converge too fast, disagreement suppressed, repetition dominates.

Metrics tracked:
- Convergence speed (too fast = suspicious)
- Vocabulary diversity (dropping = conformity)
- Disagreement frequency (zero = unhealthy)
- Novel idea rate (zero = stagnation)
- Cross-pollination rate

When destructive groupthink is detected, the monitor recommends interventions:
- Drop a curveball
- Invite a seeded stranger
- Assign a ZeroClaw to play devil's advocate
- Change the room mode

Also includes a `DevilsAdvocate` that generates counterarguments and provocative questions.

## Architecture

```
src/
├── types.ts                 # Shared types
├── emergence-detector.ts    # EmergenceDetector + PredictabilityEstimator
├── interruption.ts          # InterruptionSystem + generators
├── revelation.ts            # RevelationTracker + chains
├── groupthink.ts            # GroupthinkMonitor + DevilsAdvocate
└── index.ts                 # Barrel export

tests/
└── emergence.test.ts        # 36 tests, all passing
```

## Design Philosophy

This system makes The Tap alive: **not a closed loop, but an open one that's hungry for the unexpected.**

The system is designed around three principles:

1. **Emergence is real** — groups produce things individuals can't. Detect it.
2. **Interruption is healthy** — stagnation is death. Seek disruption.
3. **Revelations iterate** — insights build on each other. Track the chains.

## Use

```typescript
import { EmergenceDetector, InterruptionSystem, RevelationTracker, GroupthinkMonitor } from "emergence-engine";

// Watch for emergent patterns
const detector = new EmergenceDetector();
const pattern = detector.observe(groupEvent);

// Seek interruptions when flow stagnates
const interruptSystem = new InterruptionSystem();
const interruption = interruptSystem.shouldInterrupt(flow, context);

// Track iterative revelations
const tracker = new RevelationTracker();
tracker.record(revelation);

// Monitor groupthink quality
const monitor = new GroupthinkMonitor();
const assessment = monitor.assess(flow);
```

## Connections

- **The Tap** — conversation stream feeds the detector
- **TapDJ** — curveballs are a primary interruption source
- **Seeded Strangers** — new perspectives disrupt groupthink
- **SMP Notebook** — reflection cells generate revelations
- **Collective Unconscious** — JEPA predictor informs predictability
- **SuperInstance** — the room as super-harness produces emergence

## License

MIT
