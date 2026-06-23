# Contributing

This repo is a sanitized frontend copy. Changes should improve terminal UI
quality without exposing private trading logic.

## Branches

Use feature branches:

```bash
git checkout -b frontend/short-description
```

Open a pull request into `main`.

## Pull Request Checklist

- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Screenshots or short screen recording attached for visual changes
- [ ] No `.env`, API key, token, cache DB, or generated `dist`
- [ ] No real provider URL, broker integration, or live order submission
- [ ] No private #6 strategy composer or #7 daily queue logic
- [ ] Mock-data disclaimer remains visible

## Allowed Work

- Layout, spacing, responsive design
- Component extraction
- Empty/loading/error states
- Accessibility improvements
- Mock-data display states
- Generic view-model helpers with tests
- Browser-only mock API states in `src/mocks/`

## Ask Before Changing

Ask before adding:

- real API calls
- provider-specific fields
- broker/order routing
- pricing/Greeks formulas
- ranking/verdict logic
- private #6/#7 workflow modules
- new large dependencies

## Data Boundary

All data in this repo must come from static/browser mock data. If a UI needs a
new state, add it to `src/mocks/` or a clearly labeled fixture and keep it mock.
