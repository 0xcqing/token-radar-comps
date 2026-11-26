# Token Launch Radar

[![make.fun token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xcqing/token-radar-comps/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xcqing/token-radar-comps/reward.svg)](https://make.fun/c/token-radar-01)

Entry for the [make.fun token launch radar bounty](https://make.fun/c/token-radar-01).

`main.ts` (Node 22, standard library only) reads the sealed snapshot at `/input/snapshot.json`, ranks every pre-token protocol by a comparable model fitted on the protocols whose token already trades, and writes `out/board.json`, `out/data.js`, the dashboard and `out/dossier.json`.

The value model: implied value = TVL x the category's median market-cap/TVL ratio (fitted on the live anchors, with a global fallback) x a clamped seven-day growth adjustment. Token odds come from each category's live share and the protocol's age; expected value = implied value x odds. Farm plans are six costed steps with a net dollar-per-hour verdict. The model is checked out of sample on held-out anchors (deterministic folds) and the page shows both the median error and the pairwise rank check.

```bash
node main.ts --input input/snapshot.json --output out
```

Dashboard: `dashboard/` is a static page (no framework, no network) with a KPI strip, integrity checks, a sortable and filterable board, and a detail view per protocol.
