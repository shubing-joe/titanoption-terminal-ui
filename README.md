# TitanOption Terminal UI Sandbox

Public, sanitized frontend sandbox for collaborating on option terminal UI.

This repository is **not** the private trading system. It contains mock data,
generic option-chain view models, and UI components that can be reviewed through
pull requests before selected changes are ported back into the private product.

## Scope

Included:

- React/Vite frontend shell
- Mock option chain data
- Generic quote ticket UI
- Generic volatility workbench UI
- TypeScript helper tests
- GitHub Actions CI

Not included:

- API keys or `.env`
- Real market data provider configuration
- Private strategy rules
- Ranking or trade-decision logic
- Real order submission
- Portfolio, trade history, or personal watchlists
- Backend/Rust/Python trading engines

Every screen must treat the data as mock/demo state and keep the visible
disclaimer:

```text
MOCK DATA - NOT FOR TRADING
```

## Local Setup

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5173
```

## Verification

Run the same commands used by CI:

```bash
npm run test
npm run lint
npm run build
```

## First Contribution Area

Recommended first PR:

- Improve `VolatilityWorkbench` layout and empty/fallback states.
- Improve `QuoteTicketPanel` information density.
- Improve mobile/tablet responsiveness.
- Keep the mock/non-trading disclaimer visible.

Do not add real API calls, secrets, broker integration, or financial formulas
that imply executable trading authority.

## Relationship To Private Repo

The private Market Playbook OS / TitanOption repo remains authoritative for:

- backend contracts
- live market adapters
- option pricing/Greeks engines
- strategy ranking
- execution gates
- owner-specific trade logic

This public repo is a frontend collaboration surface only. Useful PRs may be
ported back into the private repo after review.
