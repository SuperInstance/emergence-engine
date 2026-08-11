# Testing Guide

> The Emergence Engine has 218 tests across 7 test files.

## Running Tests

```bash
npm test          # Run all tests
npx vitest run    # Same thing, explicit
npx vitest watch  # Watch mode
```

## Test Files

| File | Tests | Module Covered |
|------|-------|----------------|
| `emergence.test.ts` | 38 | Integration tests across all modules |
| `examples.test.ts` | 11 | Example scenarios (sensor/hydrophone, revelation chains) |
| `predictability-estimator.test.ts` | 25 | `PredictabilityEstimator` — profiling, vocabulary, unpredictability |
| `emergence-detector.test.ts` | 33 | `EmergenceDetector` — all 5 pattern types, config, flow assessment |
| `interruption-system.test.ts` | 29 | `InterruptionSystem` — all 7 generators, hunger, stagnation, custom generators |
| `revelation-tracker.test.ts` | 44 | `RevelationTracker` — chains, links, classification, export, phase transitions |
| `groupthink-monitor.test.ts` | 38 | `GroupthinkMonitor` + `DevilsAdvocate` — classification, scoring, trends |

## What's Tested

### PredictabilityEstimator
- Profile creation and vocabulary accumulation
- Word filtering (length > 2, lowercase conversion)
- Topic extraction (bigrams with stop word removal, max 10 per message)
- Average message length tracking (running average)
- Recent messages buffer (max 20, FIFO)
- Unpredictability scoring (vocab 40%, topics 40%, length 20%)
- Multi-agent profile separation
- Edge cases: empty content, short words only, unknown agents

### EmergenceDetector
- All 5 pattern types: synergy, creativity, conflict, insight, phase_transition
- Configuration: defaults, partial overrides, minParticipants, observationWindow
- Event buffering: feed(), buffer trimming, implicit feed via observe()
- Pattern detection order (synergy > insight > creativity > conflict > phase_transition)
- Intensity clamping [0, 1]
- noIndividualCouldPredict matches threshold
- Stagnation detection and reset
- Flow assessment: vocabulary diversity, convergence, cross-pollination
- Multiple patterns in sequence

### InterruptionSystem
- All 7 generators: dissatisfaction, new_model, cross_pollination, serendipity, seeded_stranger, dj_curveball, external_event
- Min/max interval enforcement
- Force-seek mode (maxInterval)
- Stagnation estimation from flow metrics
- Hunger tracking (0→1 over maxInterval ticks)
- Acceptance rate calculation
- Custom generator registration (multiple, null-returning)
- Quality threshold and force-seek lowering

### RevelationTracker
- Chain building, extension, and chain-breaking
- Iteration numbering (1-indexed, auto from chain position)
- Semantic similarity for chain extension (Jaccard index, threshold 0.2)
- Relationship classification: contradicts, reframes, transforms, deepens, builds_on
- Phase transition detection
- Chain retrieval: by ID, active, by depth, by agent
- Export map (Markdown format)
- createRevelation helper: defaults, clamping, unique IDs
- Complex multi-agent chains (5-revelation scenario)

### GroupthinkMonitor
- Classification: productive, destructive, neutral
- Scoring: -1 to +1 with clamping
- Convergence penalty above threshold
- Vocabulary diversity penalty below threshold
- Recommendations for destructive states (ZeroClaw, curveball, stranger, room mode)
- Trend analysis: improving, stable, declining (±0.15 threshold)
- Stagnation detection (3+ non-productive assessments)
- History tracking (capped at 50)
- feed() method for event buffering

### DevilsAdvocate
- Counterargument generation with participant references
- Provocative questions with topic inclusion
- Word inversion (always→never, right→wrong, etc.)

## Test Helpers

```typescript
// Create a GroupEvent for testing
function makeEvent(agentId: string, content: string, overrides?: Partial<GroupEvent>): GroupEvent

// Create a GroupFlow for testing
function makeFlow(overrides?: Partial<GroupFlow>): GroupFlow
```

## Adding New Tests

1. Create a new file in `tests/` or add to an existing file
2. Follow the pattern: `describe("Module — Section", () => { it("does thing", () => { ... }) })`
3. Use `beforeEach` to reset state between tests
4. Use conditional assertions (`if (pattern) { expect(...) }`) for tests where randomness is involved
5. Run `npm test` to verify

## Design Principles for Tests

- **Test behavior, not implementation** — tests should verify what the system does, not how
- **Handle randomness** — many generators use `Math.random()`; use conditional assertions or multiple attempts
- **Test edge cases** — empty input, boundary values, extreme parameters
- **Test the "open loop"** — the system WANTS to be interrupted; verify hunger and seeking behavior
