# GreekVisualizer

GreekVisualizer is an educational sandbox for European option pricing, the Black–Scholes–Merton model, and the Greeks. It also includes a multi-leg strategy worksheet and a separate Cox–Ross–Rubinstein explorer for American exercise.

Everything is calculated in the browser. There is no backend, no account, no API key, and no live market data. The numbers are model values, not quotes and not trading advice.

The intended GitHub Pages address is [https://littleriverdevelopment.github.io/GreekVisualizer/](https://littleriverdevelopment.github.io/GreekVisualizer/). This repository does not treat that site as live until a Pages deployment has actually succeeded.

## Features

- European call and put prices, intrinsic and extrinsic value, and delta, gamma, theta, vega, and rho.
- Interactive 3D surface with a linked 2D slice, scenario marker, and optional expiration-payoff overlay.
- Guided scenarios, including a fully repriced case where the underlying moves in your favor and the option still loses value.
- Strategy builder with signed quantities, a fixed entry price, expiration P&L, pre-expiration model P&L, and aggregate Greeks.
- Separate American binomial-tree tab. It does not reuse the European Greeks.
- Shareable URL state and named scenarios stored only in this browser.
- Light and dark themes, keyboard access, and a 2D fallback when WebGL is missing.

## Local install

Requires Node.js 22 or newer.

```bash
npm ci
```

## Commands

```bash
npm run dev        # http://localhost:5173/GreekVisualizer/
npm test           # Vitest numerical tests
npm run test:e2e   # Playwright smoke tests against the production build
npm run build      # typecheck and production build
npm run preview    # serve dist, also under /GreekVisualizer/
```

`npm run test:e2e` needs Playwright’s Chromium (`npx playwright install chromium`). The dev server and the preview server both use the `/GreekVisualizer/` base path, matching a GitHub project site.

## GitHub Pages

The production base path is set in `vite.config.ts`:

```ts
base: '/GreekVisualizer/'
```

Asset URLs are prefixed with that base, and shared scenario links keep it because they are built from the page address. For a custom domain or a user site served from the domain root, change `base` to `'/'` and rebuild. Do not add client-side routes that need server rewrites; the app is one page and keeps its scenario in the query string.

The workflow `.github/workflows/pages.yml` runs on a push to `main` and on `workflow_dispatch`. It installs dependencies with `npm ci`, runs the unit tests, builds, checks that `dist/index.html` references `/GreekVisualizer/`, runs the Playwright smoke tests, uploads `dist` as a Pages artifact, and deploys with the official GitHub Pages actions.

To publish the site:

1. Merge this branch to `main` (or run the workflow once `main` contains it).
2. In the repository settings, open **Pages** and set the source to **GitHub Actions**.
3. If GitHub asks you to approve the `github-pages` environment, approve it.
4. Wait until the “Test and deploy” workflow finishes. The Pages URL is live only after that deployment succeeds.

## Model

Inputs are the spot `S`, strike `K`, time `T` in years, annualized volatility `sigma` as a decimal, continuous risk-free rate `r` as a decimal, and continuous dividend yield `q` as a decimal. The interface shows volatility, the rate, and the dividend yield as percents. The URL stores the decimals, so 20% volatility is `sigma=0.20`.

Time is calendar days divided by 365. That is a modeling choice, not the day-count of a listed contract.

For `T > 0` and `sigma > 0`:

```text
d1 = [ln(S/K) + (r - q + sigma^2 / 2) T] / [sigma sqrt(T)]
d2 = d1 - sigma sqrt(T)
call = S exp(-qT) N(d1) - K exp(-rT) N(d2)
put  = K exp(-rT) N(-d2) - S exp(-qT) N(-d1)
```

`N` is the standard normal CDF, evaluated as `Φ(x) = ½ erfc(−x / √2)`.

### Greek conventions

| Greek | Meaning | What the cards show |
| --- | --- | --- |
| Delta | Change in value per $1 move in the underlying | per share |
| Gamma | Change in delta per $1 move in the underlying | per share |
| Theta | Change as calendar time passes | annual theta / 365, so per calendar day |
| Vega | Change per increase in decimal volatility | raw vega × 0.01, so per 1 percentage point |
| Rho | Change per increase in the continuous rate | raw rho × 0.01, so per 1 percentage point |

Prices and the cards are per share. A contract multiplier, default 100, converts a signed contract quantity into position value, position P&L, and position Greeks. Buy is positive and sell is negative. Stock quantity is in shares: stock delta equals the signed share count and the other stock Greeks are zero. The stock leg does not use the option multiplier.

### Boundaries

- At expiration, the price is the intrinsic payoff `max(S−K, 0)` or `max(K−S, 0)`. The Greek formulas are singular there, so the app shows “undefined at this boundary” instead of a one-sided limit or a zero.
- At zero volatility and positive time, the price is the discounted payoff of the deterministic forward. Delta, theta, vega, and rho use the finite limit. Gamma stays undefined, because the zero-volatility limit is not an ordinary function.
- Intrinsic value is undiscounted. Extrinsic value is model price minus intrinsic value. For a European option that difference can be negative.
- Spot and strike must be positive. Time and volatility must be nonnegative. Rates may be negative. Non-finite inputs are rejected.
- Surface points where a Greek is undefined are masked. They are not drawn as zero. Price charts may include expiration.

Put–call parity in this model is `C − P = S exp(−qT) − K exp(−rT)`.

## Assumptions and limits

The European model assumes European exercise, constant volatility and rates inside one valuation, a continuous dividend yield, no transaction costs, and idealized continuous trading with lognormal dynamics. It does not model a volatility smile, liquidity, bid–ask spreads, discrete dividends, or jumps. A smooth model price is not a market price, and the assumptions do not remove risk.

Delta is not the probability of expiring in the money. Theta is not negative for every long European option. With the other inputs fixed and time left, a higher volatility raises a standard European call and a standard European put in this model.

The strategy worksheet prices every option leg at one shared expiration. Entry premiums stay fixed until you reset them. P&L is current model value minus that fixed entry, including stock cost basis. It excludes fees, financing, and dividend cash flows. Unlimited expiration profit or loss is read from the tail slope as the spot rises, not from the edge of the chart. The spot cannot be negative, so the downside of these vanilla payoffs is finite at a spot of zero.

The American tab is a Cox–Ross–Rubinstein tree, not Black–Scholes. American Greeks are omitted because finite differences on that tree oscillate with the step count. If the risk-neutral probability leaves `(0, 1)`, or volatility is zero and the up and down moves coincide, the tree price is withheld or replaced by a documented deterministic scan. Zero volatility is not forced through a singular tree.

Saved scenario names stay in `localStorage` on this browser. There is no analytics.

## References

- [Black and Scholes, “The Pricing of Options and Corporate Liabilities,” Journal of Political Economy (1973)](https://doi.org/10.1086/260062)
- [Merton, “Theory of Rational Option Pricing,” Bell Journal of Economics and Management Science (1973)](https://doi.org/10.2307/3003143)
- [NIST Digital Library of Mathematical Functions, §7.2, error functions](https://dlmf.nist.gov/7.2)
- [Cox, Ross, and Rubinstein, “Option pricing: A simplified approach,” Journal of Financial Economics (1979)](https://doi.org/10.1016/0304-405X(79)90015-1)

## Project structure

```text
src/quant        pricing, Greeks, strategies, binomial tree, surface sampling
src/scenario     defaults, URL schema, localStorage
src/content      guided-scenario definitions
src/components   interface
e2e              Playwright smoke tests
.github/workflows/pages.yml
```

Quantitative code does not import React. Chart sampling is separate from Plotly rendering.
