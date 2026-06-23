# TitanOption Terminal UI

Sanitized frontend-only copy of the TitanOption terminal.

It mirrors the current terminal shell, workspace layout, option-chain panel,
2D/3D views, volatility panels, quant radar, report view, and paper-simulation
UI. It uses a fresh mock market snapshot in the browser so the terminal can be
run and reviewed locally without the private backend.

## Public Boundary

Included:

- Current React/Vite terminal frontend structure
- Shared UI components and workspace layout
- Browser-only mock API for `/api/market/*` and `/api/option-core/*`
- Current-market-style mock option chain, mock vol surface, mock option-core responses
- Focused tests and GitHub Actions CI

Excluded:

- `.env`, API keys, tokens, provider URLs
- Real backend server, Python bridge, cache DBs, generated `dist`
- Private strategy composer module (#6)
- Private daily queue / closed-loop decision module (#7)
- AI strategy advisor / private decision assistant
- Real market-data configuration
- Real order submission or broker routing
- Personal watchlists, trade history, ranking rules, or owner-specific logic

All public API responses come from `src/mocks/mockApi.ts`.

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

## Development Targets

Good first PRs:

- Improve panel layout, spacing, density, and responsive behavior.
- Improve option-chain table ergonomics and quote-ticket display.
- Improve loading, empty, fallback, and mock-data states.
- Extract shared UI components when it makes the copied frontend easier to maintain.
- Add focused tests for UI helpers and public mock states.

Do not add real API calls, secrets, provider-specific credentials, broker
integration, trading formulas that imply execution authority, or private
decision workflow logic.

## Working Model

Develop and review frontend changes here first. Accepted changes can be
manually ported back into the private TitanOption repo.
