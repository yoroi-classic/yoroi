# Mobile cardano-wallet-backend /v1 Audit

Refs: yoroi-classic/yoroi#55 and yoroi-classic/cardano-wallet-backend#71.
Checked on 2026-07-15 against mobile `develop` and the backend `development` branch.

## Current Mobile Backend Defaults

Mobile still has active Yoroi/Emurgo-hosted defaults in several places:

- `mobile/packages/blockchains/networks/network-configs.ts` sets `legacyApiBaseUrl` to
  `https://api.yoroiwallet.com/api`, `https://preprod-backend.yoroiwallet.com/api`, and
  `https://preview-backend.emurgornd.com/api`. Wallet sync, submit, account state, Catalyst, and
  pool reads still flow through `networkManager.legacyApiBaseUrl`.
- `mobile/packages/api/cardano/api/config.ts` sets the older backend-zero root URLs to
  `https://zero.yoroiwallet.com`, `https://yoroi-backend-zero-preprod.emurgornd.com`, and
  `https://yoroi-backend-zero-preview.emurgornd.com`.
- `mobile/packages/staking/governance/config.ts` points DRep and stake-key state reads directly at
  `zero.yoroiwallet.com` and `emurgornd.com`.
- `mobile/src/common/hooks/useRemoteConfig.ts` fetches Emurgo's `yoroi-config` repository from
  `raw.githubusercontent.com`.
- `mobile/src/features/Discover/common/helpers.ts` constructs DApp logo URLs under Emurgo's
  `yoroi-config` repository; the later image request performs the fetch.
- `mobile/src/features/Portfolio/common/hooks/usePortfolioImage.ts` and
  `mobile/packages/portfolio/adapters/dullahan-api/api-maker.ts` use
  `*.processed-media.yoroiwallet.com` for token/NFT media and invalidation.
- `mobile/packages/portfolio/adapters/dullahan-api/api-maker.ts` still uses backend-zero-style
  token activity and token price-history endpoints.
- `mobile/packages/resolver/adapters/cns/api.ts` still points CNS reads at Yoroi backend hosts.

## Existing Backend-Zero Adapter Is Not /v1

Do not point the existing `backend-zero` adapter at a `cardano-wallet-backend` `/v1` base URL and
expect it to work. Its contract still uses old paths and assumptions:

- `bestblock`
- `POST /wallets` and `GET /wallets/{id}` wallet registration
- `GET /wallets/{id}/transactions`
- `GET /wallets/{id}/paymentkeyhashes?used=true`
- `POST /tx`
- `GET /cexplorer-pool-list?order=ranking`
- `GET /transactions/{hash}`

The current backend `/v1` contract uses different resource shapes:

- `GET /v1/status`
- `GET /v1/chain/tip`
- `GET /v1/chain/protocol-params`
- `GET /v1/account/{stake}/state`
- `GET /v1/account/{stake}/utxos`
- `GET /v1/account/{stake}/txs`
- `GET /v1/account/{stake}/rewards`
- `POST /v1/addresses/filter-used`
- `POST /v1/tx/submit`
- `GET /v1/tx/{hash}/status`
- `POST /v1/tx/utxos`
- `GET /v1/pools`
- `POST /v1/pools/info`
- `POST /v1/assets/info`
- `POST /v1/assets/media`
- `GET /v1/assets/{fingerprint}/image`
- `GET /v1/config`
- `GET /v1/openapi.json`

The next safe code step is a separate `cardano-wallet-backend /v1` adapter and config key, not a
rename of `backendZeroUrl`.

## Main Client-Side Blocker

Mobile UTxO sync is still pinned to the legacy rollback-diff model in `mobile/packages/tx/utxo/`:

- `GET /api/v2/tipStatus`
- `POST /api/v2/txs/utxoAtPoint`
- `POST /api/v2/txs/utxoDiffSincePoint`

`cardano-wallet-backend /v1` intentionally exposes current-state account reads instead:

- `GET /v1/account/{stake}/utxos`
- transaction status/history reads
- client-side pending transaction handling

There is no response adapter that can make a current-state endpoint answer "diff since this block".
The mobile UTxO layer needs a rewrite to current-state reads plus a pending-transaction overlay
before the wallet sync path can be switched away from the legacy backend.

## Backend Coverage Already Available For Mobile Adapters

Some mobile-owned Yoroi/Emurgo defaults need client adapter work, not new backend routes:

- `mobile/packages/staking/governance/config.ts` DRep lookup can map to
  `POST /v1/governance/dreps/info`.
- The same governance config's stake-key voting state needs an adapter that derives the bech32
  stake address required by `GET /v1/account/{stake}/state` from the stake-key hash currently sent
  by mobile. The response's `delegatedDrep` value also omits the `tx`, `epoch`, `slot`, and
  delegation-kind metadata consumed by `governance/manager.ts`; preserving that behavior requires
  backend enrichment or an explicit mobile contract change.
- Backend-zero address discovery `filterUsedAddresses` can map to
  `POST /v1/addresses/filter-used`.

## Backend/Product Decisions Still Blocking Full Cutover

- Price endpoints are reserved in `/v1` but return 501 until a market-data provider is chosen.
  Mobile uses token activity and token price history for fiat values and charts.
- Catalyst `fundInfo` is not implemented in `/v1`; either drop/feature-flag Catalyst UI or add an
  owned replacement.
- Emurgo-business endpoints should be removed or feature-flagged, not reimplemented:
  swap fee tiers, Encryptus payout links, backend-zero wallet registration, and curated
  `cexplorer-pool-list` ranking.
- NFT trait rarity remains a product/backend indexing decision. Traits are covered by
  `/v1/assets/info`; rarity is not.

## Recommended Small Next Steps

1. Add an explicit mobile config field for an owned `cardano-wallet-backend /v1` base URL. Keep it
   separate from `legacyApiBaseUrl` so development/test builds can target an owned deployment while
   legacy-only paths remain obvious.
2. Add a new `/v1` adapter beside the existing legacy and backend-zero adapters. Start with
   stateless reads that map cleanly: status/tip, protocol parameters, address discovery, governance
   reads, tx submit/status, pool info, asset metadata, and remote config.
3. Rewrite `mobile/packages/tx/utxo/` around `/v1/account/{stake}/utxos` and local pending
   transactions before switching wallet sync preferences.
4. Feature-flag or remove price, Catalyst, CNS, and Emurgo-business surfaces before asserting that
   runtime/build config has no active Yoroi/Emurgo defaults.
