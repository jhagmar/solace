# Contributing

Bootstrap, test, and send changes against this public tree.

```bash
npm install
npm test
npm run test:layering
npm run lint
npm run format:check
```

Node 26 or newer. Use npm 12 or newer. Keep the layering test green. User-visible strings live in `src/shared/ui/messages/`.

## GitHub checks

CI, Scorecard, CodeQL, and Lighthouse run from `.github/workflows/`. Coverage uploads to Codecov. Maintainers need to finish the GitHub-side setup (Codecov token, default-branch protection, code scanning, and a passing Lighthouse run against https://solace.aztex.eu) before the README badges stay green.
