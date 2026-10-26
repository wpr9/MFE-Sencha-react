# ADR-0008: Module Federation 2 over Piral for the Ext JS migration

**Status:** accepted (October 2026)

## Context

The composition layer must carry a large Sencha Ext JS application into React
screen by screen (strangler fig), across several teams and several years.
Two options were evaluated against six questions: longevity, team
independence, Ext JS coexistence, security and control, tooling fit (Nx,
Rsbuild/Rspack), and cost and lock-in.

- **Option A:** Nx with Module Federation 2 plus a thin, owned platform
  contract. This is what the Meridian POC implements.
- **Option B:** Piral, an app shell plus _pilets_ registered through a
  `PiletApi` and delivered by a feed service.

## Facts (checked 25 October 2026)

| Question                                   | Nx + Module Federation 2                                                                                                                                                                                                                       | Piral                                                                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maturity                                   | MF 2.0 stable since 10 Feb 2026; `@module-federation/enhanced` 2.9.2 (26 Sep 2026), 32 stable releases in 12 months [1][2]                                                                                                                     | 1.x since June 2023; 1.12.4 (11 Sep 2026), 14 stable releases in 12 months [3]                                                                                                                                   |
| Usage (weekly npm, 30 days to 22 Oct 2026) | `enhanced` ~3.4M (+60% a year); `rsbuild-plugin` ~158k [2]                                                                                                                                                                                     | `piral-core` ~11.4k (−40% a year), `piral-cli` ~11.7k (−45%) [2]                                                                                                                                                 |
| Maintainers                                | 211 contributors; 38 committed in the last 12 months (ByteDance Web Infra and Zack Jackson, MF's creator) [4]                                                                                                                                  | 46 contributors; ~87% of last year's commits by one maintainer (smapiot GmbH) [5]                                                                                                                                |
| Tooling                                    | Official plugins for webpack, Rspack, Rsbuild 2, Vite and Rollup. Nx 23 deprecated and Nx 24 (21 Oct 2026) removed Nx's own MF wrappers, in favour of the official plugins with runtime `registerRemotes`/`loadRemote` (the POC's pattern) [6] | Own CLI. The Rspack plugin requires `@rspack/core ^1.1.5`, so no Rspack 2 (our build). No Nx plugin; docs say Piral is "designed primarily for distributed development" (a repository per micro frontend) [7][8] |
| Runtime and operations                     | Open MIT runtime: manifests, type hints, Chrome DevTools, runtime plugins; no first-party feed (a registry is ours, or third-party Zephyr Cloud) [9]                                                                                           | Pilet API and feed service; production-tier Piral Cloud "Docker Pro" is €3,500/year and closed source; the feed spec and an MIT sample service are open [10]                                                     |
| MF interop                                 | Native                                                                                                                                                                                                                                         | `pilet build --schema mf` uses the classic container API (`init`/`get`), not the MF 2.0 runtime or manifest [11]                                                                                                 |
| Ext JS                                     | No converter needed: our `mount`/`update`/`unmount` contract hosts Ext JS 6.2 in the POC                                                                                                                                                       | No Ext JS converter, guide or case study among 21 converters; the generic `html` component has our contract's shape [12]                                                                                         |
| Talent pool (Stack Overflow questions)     | `webpack-module-federation` 528, `nrwl-nx` 904 [13]                                                                                                                                                                                            | `piral` 16 [13]                                                                                                                                                                                                  |
| Adopters                                   | Official showcase: Lululemon, Business Insider, Best Buy, adidas, Shopify Partners, Epic Games, ZoomInfo [14]                                                                                                                                  | Vendor logo wall (18 names); no independent case study found [15]                                                                                                                                                |

**Applies to both:**

- Ext JS 6.x standard support ended 1 Mar 2022; 7.x is supported to 1 Oct 2028, and 8.0 shipped 7 Apr 2026 [16].
- The last GPLv3 release was 7.0, and a GPL start cannot be converted to a commercial licence by purchase [17].
- Commercial licences are per developer.
- Sencha ReExt requires Ext JS 7.x or later [18].

## Decision

Standardise on **Nx + Module Federation 2**, composed through our own
versioned Host API contract and runtime registry (ADR-0001, ADR-0005), using
the official MF plugins directly.

## Consequences

- Teams code against _our_ contract; Module Federation is only the loader and
  could be replaced behind it.
- We own what Piral would provide: a registry with change control, the Host
  API, outlets and intents, and standalone dev hosts. All but registry change
  control exist in the POC.
- Risks we accept, and their containment, are in
  [security-architecture-review.md](../security-architecture-review.md) §3.4:
  - shared-dependency drift (only React is shared; contract negotiation);
  - build-tool coupling (official plugins);
  - maintainer concentration (an open runtime with a broad contributor base).
- **Revisit if** MF 2 maintenance stalls, or the programme needs a vendor-run
  feed with support (evaluate Zephyr Cloud and Piral Cloud then).

## Sources

1. https://module-federation.io/blog/v2-stable-version.html
2. https://registry.npmjs.org and https://api.npmjs.org/downloads/point/last-month/<package>
3. https://registry.npmjs.org/piral
4. https://github.com/module-federation/core (GitHub API: contributors, commits)
5. https://github.com/smapiot/piral (GitHub API: contributors, commits)
6. https://nx.dev/docs/kb/migrate-from-nx-module-federation and https://github.com/nrwl/nx/releases/tag/24.0.0
7. https://github.com/smapiot/piral-cli-rspack
8. https://github.com/smapiot/piral/blob/develop/docs/tutorials/23-monorepo.md
9. https://module-federation.io/guide/runtime/runtime-api.html and https://module-federation.io/guide/deployment/zephyr.html
10. https://www.piral.cloud/comparison and https://github.com/smapiot/piral/blob/develop/docs/specs/feed-api-specification.md
11. https://github.com/smapiot/piral/blob/develop/src/framework/piral-base/src/loaders/mf/index.ts
12. https://github.com/smapiot/piral/tree/develop/src/converters and https://github.com/smapiot/piral/blob/develop/src/framework/piral-core/src/types/components.ts
13. https://api.stackexchange.com/2.3/tags/piral;webpack-module-federation;nrwl-nx/info?site=stackoverflow
14. https://module-federation.io/showcase/
15. https://github.com/smapiot/piral/blob/develop/src/pages/www/src/scripts/components/Companies.tsx
16. https://www.sencha.com/support/
17. https://www.sencha.com/legal/open-source-faq/
18. https://www.sencha.com/products/reext/
