# Stress Test Results — 2026-03-10T00:18:24.467Z

## Summary
| Phase | Pass | Total | Score |
|-------|------|-------|-------|
| Phase 0: Baseline | 10 | 10 | 100% |
| Phase 1: Scale 500 | 10 | 10 | 100% |
| Phase 2: 100 Cycles | 5 | 5 | 100% |
| Phase 3: Catastrophic Forgetting | 5 | 5 | 100% |
| Phase 4: Bridge Formation | 5 | 5 | 100% |
| Phase 5: Adversarial | 5 | 7 | 71% |
| Phase 6: Recovery | 8 | 10 | 80% |
| **OVERALL** | **48** | **52** | **92.3%** |

## Final Stats
- Total memories: 35 (active=25)
- Associations: 1675
- Avg confidence: 0.615

## Graph Health
| Cycle | Edges | Active | Recall | Cross |
|-------|-------|--------|--------|-------|
| 1 | 1791 | 261 | 100% | 60% |
| 10 | 792 | 243 | 40% | 0% |
| 20 | 3199 | 143 | 70% | 0% |
| 30 | 4233 | 43 | 70% | 0% |
| 40 | 4364 | 35 | 70% | 0% |
| 50 | 3295 | 34 | 70% | 0% |
| 60 | 2626 | 25 | 70% | 0% |
| 70 | 2137 | 17 | 40% | 0% |
| 80 | 1882 | 16 | 40% | 0% |
| 90 | 1723 | 14 | 40% | 0% |
| 100 | 1649 | 13 | 40% | 0% |

## Phase Details
### Phase 0: Baseline
  [PASS] relativity time dilation clocks
  [PASS] Maillard reaction searing browning
  [PASS] bond prices interest rates inverse
  [PASS] insulin blood glucose diabetes
  [PASS] minor scale melancholic harmonic
  [PASS] E=mc^2 mass energy equivalence
  [PASS] compound interest exponential growth
  [PASS] vaccine immune memory cells
  [PASS] sous vide precise temperature cooking
  [PASS] chord progression harmony tension


### Phase 1: Scale 500
  [PASS] relativity time dilation clocks
  [PASS] Maillard reaction searing browning
  [PASS] bond prices interest rates inverse
  [PASS] insulin blood glucose diabetes
  [PASS] minor scale melancholic harmonic
  [PASS] E=mc^2 mass energy equivalence
  [PASS] compound interest exponential growth
  [PASS] vaccine immune memory cells
  [PASS] sous vide precise temperature cooking
  [PASS] chord progression harmony tension

Metrics: {"seedTimeS":153,"memPerMin":"196"}

### Phase 2: 100 Cycles
  Edge ratio (first→last): 0.92x (1791→1649)
  Recall stable (last 5 checks ≥40%): true
  Cycle 1: edges=1791 active=261 recall=100% cross=60%
  Cycle 10: edges=792 active=243 recall=40% cross=0%
  Cycle 20: edges=3199 active=143 recall=70% cross=0%
  Cycle 30: edges=4233 active=43 recall=70% cross=0%
  Cycle 40: edges=4364 active=35 recall=70% cross=0%
  Cycle 50: edges=3295 active=34 recall=70% cross=0%
  Cycle 60: edges=2626 active=25 recall=70% cross=0%
  Cycle 70: edges=2137 active=17 recall=40% cross=0%
  Cycle 80: edges=1882 active=16 recall=40% cross=0%
  Cycle 90: edges=1723 active=14 recall=40% cross=0%
  Cycle 100: edges=1649 active=13 recall=40% cross=0%

Metrics: {"edgeRatio":0.92071468453378,"lastRecall":40}

### Phase 3: Catastrophic Forgetting
  [SURVIVED] E=mc^2 mass energy equivalence
  [SURVIVED] resting meat juices redistribute cooking
  [SURVIVED] diversification portfolio risk reduction
  [SURVIVED] vaccine immune memory cells response
  [SURVIVED] minor scale melancholic harmonic

Metrics: {"survived":5,"total":5}

### Phase 4: Bridge Formation
  Pre-bridge: 1/5
  Post-bridge: 5/5
  Improvement: YES (+4)
  [PASS] CROSS: timing and measurement in physics and music (physics,music)
  [PASS] CROSS: precise temperature control in medicine and cookin (medicine,cooking)
  [PASS] CROSS: exponential growth compounding biology finance (finance,medicine)
  [PASS] CROSS: energy transformation chemical and nuclear reactio (physics,cooking)
  [PASS] CROSS: risk diversification defense immune system portfol (finance,medicine)


### Phase 5: Adversarial
  Retracted in results: 0 (want 0)
  Spam in physics top-10: 0 (want ≤2)
  Post-spam recall: 3/5


### Phase 6: Recovery
  Baseline was: 100%
  Recovery: 80% (target: ≥70%)
  Recovered: YES
  [PASS] relativity time dilation clocks
  [FAIL] Maillard reaction searing browning — no cooking in top 5
  [PASS] bond prices interest rates inverse
  [FAIL] insulin blood glucose diabetes — no medicine in top 5
  [PASS] minor scale melancholic harmonic
  [PASS] E=mc^2 mass energy equivalence
  [PASS] compound interest exponential growth
  [PASS] vaccine immune memory cells
  [PASS] sous vide precise temperature cooking
  [PASS] chord progression harmony tension

Metrics: {"baselinePct":100,"recoveryPct":80,"recovered":true}
