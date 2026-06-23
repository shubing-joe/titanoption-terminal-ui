# Contributing

This repo is a UI sandbox. Contributions should improve generic frontend
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
- [ ] Mock-data disclaimer remains visible

## Allowed Work

- Layout, spacing, responsive design
- Component extraction
- Empty/loading/error states
- Accessibility improvements
- Mock-data display states
- Generic view-model helpers with tests

## Ask Before Changing

Ask before adding:

- real API calls
- provider-specific fields
- broker/order routing
- pricing/Greeks formulas
- ranking/verdict logic
- new large dependencies

## Data Boundary

All data in this repo must be static mock data. If a UI needs a new state,
add a fixture in `src/fixtures/` and label it as mock.
