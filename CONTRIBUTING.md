# Contributing to Emergence Engine

## Getting Started

```bash
git clone https://github.com/SuperInstance/emergence-engine.git
cd emergence-engine
npm install
```

## Running Tests

```bash
npm test
```

All 49 tests should pass. If any fail, open an issue.

## Running Examples

```bash
npx tsx examples/basic-emergence.ts       # See emergence detection in action
npx tsx examples/interruption-demo.ts      # Watch the system get hungry for disruption
```

## Architecture

The Emergence Engine has four modules, each independent but composable:

| Module | Purpose | Key Class |
|--------|---------|-----------|
| `emergence-detector.ts` | Detects patterns no individual agent could produce | `EmergenceDetector`, `PredictabilityEstimator` |
| `interruption.ts` | Actively seeks better things to break the flow | `InterruptionSystem` |
| `revelation.ts` | Tracks iterative insight chains across agents | `RevelationTracker` |
| `groupthink.ts` | Distinguishes synergy from conformity | `GroupthinkMonitor`, `DevilsAdvocate` |

### Core Principle

> The system is not a closed loop. It's an OPEN loop that's hungry for interruption.

Every module follows this principle:
- **EmergenceDetector** doesn't just flag patterns — it identifies when the group outgrows what it can measure
- **InterruptionSystem** doesn't just allow interruptions — it SEEKS them
- **RevelationTracker** doesn't just log insights — it maps how they transform each other
- **GroupthinkMonitor** doesn't just detect conformity — it recommends interventions

## Adding a New Interruption Source

1. Implement the `InterruptionGenerator` interface in `interruption.ts`
2. Register it with `system.registerGenerator(myGenerator)`
3. Add tests in `tests/examples.test.ts`

## Adding a New Emergence Type

1. Add the type to `EmergentPattern["type"]` in `types.ts`
2. Implement a detection method in `emergence-detector.ts`
3. Wire it into the `observe()` method's detection chain
4. Add tests

## Code Style

- TypeScript strict mode
- Comments explain *why*, not *what*
- Every public method has a doc comment
- Tests prove the behavior, not the implementation
