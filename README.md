# Solace

[![CI](https://github.com/jhagmar/solace/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/jhagmar/solace/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/jhagmar/solace/graph/badge.svg?branch=master)](https://codecov.io/gh/jhagmar/solace)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jhagmar/solace/badge)](https://scorecard.dev/viewer/?uri=github.com/jhagmar/solace)
[![Lighthouse](https://github.com/jhagmar/solace/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/jhagmar/solace/actions/workflows/lighthouse.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The running app is at [https://solace.aztex.eu](https://solace.aztex.eu).

**Know your sun.** Solace is a personal UV planner: today’s forecast for a place, plus a burn-risk estimate from your skin, sunscreen, and time outdoors. It is a website you can install. There is no account and no Solace server.

**Solace is not a medical device and does not give medical advice.** Burn-risk colours are estimates only. Clothing, shade, and labelled sunscreen remain your responsibility ([14]). Individual sensitivity varies; medication, a base tan, body site, cloud, reflection, and how you stand or lie in the sun can move the real threshold by a factor of two or more ([1], [4], [8]). You use Solace at your own risk.

## How to use it

There is one screen: Today.

1. **Install** when the browser offers it, if you want the app on a home screen. **Light / Dark / Auto** is always in the header. Auto follows the OS; dark is the default when Auto has no preference yet.
2. **Search for a location.** Type at least three letters. Recents appear when the field is empty. Until a place is chosen, Today’s UV, Sunscreen, and Exposure stay locked; skin tone stays usable.
3. **Skin tone** is six faces (Very fair … Dark brown). That choice sets how fast the burn-risk curve climbs.
4. **Today’s UV** shows the public UV index and your burn-risk curve for the local day. Captions say `updating` / `simulating`, then Index and Burn risk (`low` / `caution` / `danger`).
5. **Sunscreen:** **Apply** and **Wash off**. Each stamp has Spf, amount (thin layer / typical amount / recommended amount), and time. Drag stamps on the chart lane, or edit a row.
6. **Exposure:** log outdoor windows with **1 hour**, **2 hours**, or **Rest of day**. Drag the lane handles to move a window. Times use the location’s time zone.
7. **Clear the day** on Today’s UV drops every outdoor window and sunscreen stamp and starts burn risk from zero. Leftover load otherwise carries across midnight.

The shell can open offline. Forecasts and location search need a network. A cached forecast can still draw until it is stale.

## Privacy

Skin tone, sunscreen, outdoor windows, theme, the selected place, recents, and the simulation log live in this browser’s `localStorage`. The only network calls are to [Open-Meteo](https://open-meteo.com/) for geocoding and the UV forecast ([17]). Clearing site data for this origin deletes that state. More detail is in [PRIVACY.md](PRIVACY.md).

## Burn risk

The chart’s coloured curve is remaining erythemal load: a planning estimate of how close the day’s outdoor time sits to a burn. Captions use **low**, **caution**, and **danger**.

| Skin tone | Caution (1 MED) | Danger (2 MED) |
| --- | ---: | ---: |
| Very fair | 2.0 SED | 4.0 SED |
| Fair | 2.5 SED | 5.0 SED |
| Medium | 4.0 SED | 8.0 SED |
| Olive | 6.0 SED | 12.0 SED |
| Brown | 8.5 SED | 17.0 SED |
| Dark brown | 12.0 SED | 24.0 SED |

A **minimal erythemal dose (MED)** is the lowest UV dose that produces just-perceptible redness 8–24 hours later on previously unexposed skin ([1], [4]). That is faint pink, not a painful sunburn ([5], [8]). A **standard erythema dose (SED)** is 100 J/m² of UV weighted by the CIE erythema action spectrum ([1], [4]). CIE keeps MED as an observation on a person and SED as the physical unit ([3]). One MED is some number of SED. Solace takes ICNIRP’s indicative unadapted values: 2.0 and 2.5 SED for Types I and II, midpoints of the Type III–V ranges, and 12 SED for Type VI (open-ended “> 10 SED”; ICNIRP’s grouped unadapted figure is 15 SED) ([1]).

**Caution** is 1 MED: you may meet the laboratory definition of erythema. **Danger** is 2 MED: UVB pain models use that dose for clear redness and heat hyperalgesia ([6], [7]). The load axis is fixed at 0–3 MED so those lines stay put; above 3 MED the curve clips.

The **UV Index** is erythemally weighted irradiance on a horizontal, unshaded surface. It is 40 times that irradiance in W/m², so 1 UVI = 25 mW/m² ([2]). One hour at a constant UVI of *U* delivers $0.9 \times U$ SED of ambient dose (90 J/m² per UVI-hour; 1 SED = 100 J/m²) ([1], [2]). One hour at UV 6 is 5.4 SED on that horizontal receiver.

## The model

The curve is a two-state ordinary differential equation. Every parameter comes from a definition, a peer-reviewed paper, or an explicit public-health rule. It is a planning model.

Let $t_0$ be a baseline instant of undamaged, unsunscreened skin.

- $D(t)$: remaining erythemal load (same unit as the MED thresholds; this is not CIE cumulative SED, which does not heal).
- $S(t) \ge 1$: effective sun protection factor.
- $U(t)$: UV Index from Open-Meteo, interpolated in time ([17]).
- $\chi(t) \in \{0,1\}$: 1 while an outdoor window covers $t$.

```math
\frac{\mathrm{d}D}{\mathrm{d}t}
  = \kappa\,\chi(t)\,\frac{U(t)}{S(t)} - k_r D,
  \qquad D(t_0)=0
```

```math
\frac{\mathrm{d}S}{\mathrm{d}t}
  = -k_s\bigl(S(t)-1\bigr),
  \qquad S(t_0)=1
```

| Symbol | Value | Why |
| --- | --- | --- |
| $\kappa$ | 0.9 SED/h per UVI | Definitional: 1 UVI for one hour is 90 J/m² ([2]); 1 SED is 100 J/m² ([1], [4]). |
| $k_r$ | $\ln 2 / 40\,\mathrm{h}$ | Diffey’s 40 h half-life for the fading limb of UV-induced erythema ([5]). |
| $k_s$ | $\ln 2 / 2\,\mathrm{h}$ | Public-health reapplication interval, as a wear-inclusive half-life ([12], [14], [15]). |

Sunscreen does not stack. Apply at $t_a$ sets $S(t_a^+)=S_0^{\alpha}$ from labelled Spf $S_0$ and amount fraction $\alpha$. Wash-off sets $S=1$. Midnight keeps leftover $D$. **Clear the day** restarts $D=0$, $S=1$.

$\alpha$ is the applied amount as a fraction of the ISO 24444 / FDA test amount of 2.00 mg/cm² ([11], [12], [13]). Effective Spf follows $S_0^{\alpha}$: Faurschou & Wulf found an exponential amount–SPF curve in vivo, with 1.0 mg/cm² behaving as the square root of labelled Spf and 0.5 mg/cm² as the fourth root ([9]).

| Amount in the app | $\alpha$ | About |
| --- | ---: | --- |
| Thin layer | 0.25 | 0.5 mg/cm², a common beach application ([10], [11]) |
| Typical amount | 0.50 | 1.0 mg/cm², the upper end of everyday use ([11], [15]) |
| Recommended amount | 1.00 | 2.0 mg/cm², the pack-test coat ([12], [13]) |

Load older than 14 days is treated as zero (product rule: a 40 h half-life leaves a negligible remainder by then ([5])).

## Assumptions and limitations

- Solace does not measure your MED. Caution and danger are ICNIRP-based planning lines on unadapted skin ([1]).
- Outdoor time is 100% of the forecast horizontal UV Index. For upright outdoor activity, commonly exposed sites typically receive about 20–60% of that ambient ([1]); lying on a beach is closer to 100%.
- Skin-tone thresholds are unadapted. ICNIRP’s grouped figures put Types I–II near 2 SED unadapted and 6 SED after three weeks of tanning without erythema ([1]). The ODE does not raise MED for a base tan ([5]).
- A new coat replaces the previous film. The app does not auto-apply a second coat.
- Sunscreen decay runs toward $S=1$ even indoors, on a two-hour half-life that folds in sweat and rub-off ([12], [14], [15]). Several commercial films remain photostable for two hours of sun in the laboratory ([16]).
- Recovery is first-order with a 40 h half-life ([5]). That carries yesterday’s afternoon into breakfast. It does not reproduce the delayed 8–12 h peak of clinical redness ([5]).
- Clothing, hats, shade, body site, sweat rate, water-resistance class, cloud, albedo, and forecast error stay outside the ODE. WHO puts clothing and shade ahead of sunscreen ([14]). Cloud and albedo sit inside Open-Meteo’s UVI ([17]).
- Self-reported skin type is a coarse slider: MED overlaps heavily across Fitzpatrick groups, and Type IV MED is only about twice Type I ([4], [8]).

## References

Sources below were read on the public internet before being cited. Product behaviour (the ODE, the 0–3 MED axis, no stacking, the 14-day cap) is Solace’s planning model; the papers supply the numbers it uses.

1. International Commission on Non-Ionizing Radiation Protection, in collaboration with ILO and WHO. *Protecting Workers from Ultraviolet Radiation.* ICNIRP 14/2007. Munich: ICNIRP; 2007. MED as just-perceptible erythema 8–24 h after irradiation; 1 SED = 100 J/m²; a UVI of 1.0 is 10% less than one SED per hour; Table 1 indicative unadapted SED ranges; Table 2 unadapted vs adapted MED; upright outdoor sites about 20–60% of ambient (citing Diffey 1999); photosensitizers and anatomical site. [PDF](https://www.icnirp.org/cms/upload/publications/ICNIRPUVWorkers.pdf)
2. World Health Organization, World Meteorological Organization, United Nations Environment Programme, International Commission on Non-Ionizing Radiation Protection. *Global Solar UV Index: A Practical Guide.* Geneva: WHO; 2002. WHO/SDE/OEH/02.2. UVI defined for a horizontal surface using the CIE erythema action spectrum; $k_{\mathrm{er}} = 40\,\mathrm{m}^2/\mathrm{W}$ (1 UVI = 25 mW/m²). [Record](https://www.who.int/publications/i/item/9241590076) · [PDF](https://iris.who.int/bitstream/handle/10665/42459/9241590076.pdf?sequence=1)
3. ISO/CIE 17166 / CIE S 007. *Erythema reference action spectrum and standard erythema dose.* SED is the standardized erythemally weighted dose; MED is reserved for observations on people. [CIE record](https://cie.co.at/publications/erythema-reference-action-spectrum-and-standard-erythema-dose-0)
4. Harrison GI, Young AR. Ultraviolet radiation-induced erythema in human skin. *Methods.* 2002;28(1):14–19. Just-perceptible MED, usually 24 h, on previously unexposed buttock skin; 1 SED = 100 J/m² CIE-weighted; Type IV MED about twice Type I, with heavy overlap across types. [doi:10.1016/S1046-2023(02)00205-0](https://doi.org/10.1016/S1046-2023(02)00205-0)
5. Diffey B. Erythema and acclimatization following repeated sun exposure: a modelling study. *Photochem Photobiol.* 2021;97(6):1558–1567. Open access. Erythema peaks about 8–12 h after exposure; fade half-life $T_{1/2} = 40$ h from 8 h and 24 h MED data; 1 MED ≈ 15% of maximal redness. [doi:10.1111/php.13466](https://doi.org/10.1111/php.13466)
6. Lopes DM, McMahon SB. Ultraviolet radiation on the skin: a painful experience? *CNS Neurosci Ther.* 2016;22(2):118–126. UVB 1, 2, and 3 MED produce dose-dependent erythema and mechanical hyperalgesia. [PMC4833175](https://pmc.ncbi.nlm.nih.gov/articles/PMC4833175/)
7. Rother M, Rother I. Placebo controlled, crossover validation study of oral ibuprofen and topical hydrocortisone-21-acetate for a model of ultraviolet B radiation (UVR)-induced pain and inflammation. *J Pain Res.* 2011;4:357–365. 1–3 MED induce erythema and reduced heat-pain threshold; 2 MED is the practical pain-model dose. [PMC3215515](https://pmc.ncbi.nlm.nih.gov/articles/PMC3215515/)
8. Ravnbak MH. Objective determination of Fitzpatrick skin type. *Dan Med Bull.* 2010;57(8):B4153. 1 SED = 100 J/m²; self-reported Fitzpatrick type is a poor ranker of MED; non-professionals often ignore painless next-day pink; body-site MED can differ by up to five-fold. [PDF](https://content.ugeskriftet.dk/sites/default/files/scientific_article_files/2018-11/b4153.pdf)
9. Faurschou A, Wulf HC. The relation between sun protection factor and amount of sunscreen applied in vivo. *Br J Dermatol.* 2007;156(4):716–719. Declared SPF assumes 2 mg/cm²; in vivo the SPF–amount curve is exponential; 1 mg/cm² ≈ square root of labelled SPF, 0.5 mg/cm² ≈ fourth root. [PMID 17493070](https://pubmed.ncbi.nlm.nih.gov/17493070/)
10. Bech-Thomsen N, Wulf HC. Sunbathers' application of sunscreen is probably inadequate to obtain the sun protection factor assigned to the preparation. *Photodermatol Photoimmunol Photomed.* 1992;9(6):242–244. Beach application averaged 0.5 mg/cm². [PMID 1343224](https://pubmed.ncbi.nlm.nih.gov/1343224/)
11. Petersen B, Wulf HC. Application of sunscreen — theory and reality. *Photodermatol Photoimmunol Photomed.* 2014;30(2–3):96–101. SPF is tested at 2 mg/cm²; everyday use is about 0.39–1.0 mg/cm². [PMID 24313722](https://pubmed.ncbi.nlm.nih.gov/24313722/)
12. U.S. Food and Drug Administration. 21 CFR 201.327. SPF test application 2 mg/cm²; Drug Facts: “reapply at least every 2 hours.” [eCFR](https://www.ecfr.gov/current/title-21/section-201.327)
13. ISO 24444:2019. *Cosmetics — Sun protection test methods — In vivo determination of the sun protection factor (SPF).* Amount after spreading $(2.00 \pm 0.05)$ mg/cm² (clause 9.4.7.1). [ISO record](https://www.iso.org/standard/72279.html) · [public text of 9.4.7.1](https://standards.iteh.ai/catalog/standards/iso/a6ec889b-4f67-4dc0-b115-cb75bcd28d0b/iso-24444-2019)
14. World Health Organization. Radiation: Protecting against skin cancer (Q&A). Clothing and shade first; sunscreen SPF 30+; re-apply every two hours, especially after sweating or swimming. [WHO](https://www.who.int/news-room/questions-and-answers/item/radiation-protecting-against-skin-cancer)
15. American Academy of Dermatology. Sunscreen FAQs. Reapply about every two hours, or after swimming or sweating; many people apply only 20–50% of the labelled amount. [AAD](https://www.aad.org/media/stats-sunscreen)
16. Gonzalez H, Tarras-Wahlberg N, Strömdahl B, Juzeniene A, Moan J, Larkö O, Rosén A, Wennberg AM. Photostability of commercial sunscreens upon sun exposure and irradiation by ultraviolet lamps. *BMC Dermatol.* 2007;7:1. Several products remained photostable after 120 min of natural sun; others were not. [PMC1831786](https://pmc.ncbi.nlm.nih.gov/articles/PMC1831786/)
17. Open-Meteo. Weather Forecast API. `uv_index` / `uv_index_max` follow WMO UV Index guidelines (cloud-aware vs clear-sky fields). [Docs](https://open-meteo.com/en/docs)

## Develop

Node 26 or newer. Package manager: npm 12 or newer. Default locale: `en`.

```bash
npm install
npm run dev
```

```bash
npm test                 # unit tests and coverage floor (80%)
npm run test:layering    # hexagonal layering gate
npm run test:e2e         # Playwright smoke + axe (needs a production build)
npm run build
npm run preview
npm run format
npm run lint
```

`npm install` sets up git hooks. Formatting runs on commit. How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md).

Stack: React 19, TypeScript (`strict`), Vite, TanStack Router, Zustand, Zod at the network boundary, odex behind the load-integrator adapter, vite-plugin-pwa, Vitest, Playwright, Biome, Oxlint.

UI commands go through `src/app/compose/`. Machines and controllers are the only writers of domain stores. Branded domain types live in `src/shared/domain`. The production clock is `clock` from `src/app/compose/clock.ts`. The load right-hand side lives in `src/features/simulation/load.ts`.

PWA mark: `public/logo.svg`. Raster sizes: `npm run generate-pwa-assets`. Safari’s pinned-tab icon is `public/mask-icon.svg`.

Hosting is a static `dist/` tree. The reverse proxy should serve `index.html` for unknown paths, send the headers in `deploy/Caddyfile`, never cache `index.html`, `sw.js`, or `theme-boot.js`, and cache `/assets/*` immutably.

```bash
caddy validate --config deploy/Caddyfile
caddy run --config deploy/Caddyfile
```

## License

[MIT](LICENSE) © 2026 Jonas Hagmar. UV and geocoding data © Open-Meteo, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The sun glyph is based on [Lucide](https://lucide.dev) (ISC). Geist is SIL Open Font License 1.1.
