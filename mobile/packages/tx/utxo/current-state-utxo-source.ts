import {Fetcher, fetcher} from '@yoroi/common'
import {
  Address,
  Balance,
  Branded,
  Chain,
  StakingAddress,
  TransactionHash,
  UtxoId,
} from '@yoroi/types'

import {z} from 'zod'

export type CurrentStateAsset = {
  readonly assetId: ReturnType<typeof Branded.asTokenId>
  readonly policyId: ReturnType<typeof Branded.asPolicyId>
  readonly name: ReturnType<typeof Branded.asAssetName>
  readonly amount: Balance.Quantity
}

/**
 * A UTxO from an authoritative current-state read.
 *
 * Unlike the legacy UTxO model, this deliberately has no block number or safe
 * point. `/v1/account/{stake}/utxos` answers what the account controls now.
 */
export type CurrentStateUtxo = {
  readonly utxoId: UtxoId
  readonly txHash: TransactionHash
  readonly txIndex: number
  readonly receiver: Address
  readonly amount: Balance.Quantity
  readonly assets: ReadonlyArray<CurrentStateAsset>
  readonly datumHash?: string
  readonly inlineDatum?: string
  readonly referenceScriptHash?: string
}

export type CurrentStateUtxoSource = {
  getAccountUtxos(
    stakeAddress: StakingAddress,
  ): Promise<ReadonlyArray<CurrentStateUtxo>>
}

const hex = z.string().regex(/^[0-9a-fA-F]*$/)
const datumHash = z.string().regex(/^[0-9a-fA-F]{64}$/)
const inlineDatum = hex.refine((value) => value.length % 2 === 0)
const referenceScriptHash = z.string().regex(/^[0-9a-fA-F]{56}$/)
const quantity = z.string().regex(/^(0|[1-9][0-9]*)$/)

const accountUtxoSchema = z.object({
  txHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  outputIndex: z.number().int().nonnegative(),
  address: z.string().min(1),
  value: quantity,
  assets: z.array(
    z.object({
      policyId: z.string().regex(/^[0-9a-fA-F]{56}$/),
      assetName: hex.refine(
        (value) => value.length <= 64 && value.length % 2 === 0,
      ),
      quantity,
    }),
  ),
  datumHash: datumHash.optional(),
  inlineDatum: inlineDatum.optional(),
  referenceScriptHash: referenceScriptHash.optional(),
})

const accountUtxosSchema = z.array(accountUtxoSchema)
const backendStatusSchema = z.object({
  // Keep this boundary free of runtime access to the @yoroi/types namespace.
  // Some consumers intentionally provide type-only mocks of that package.
  network: z.enum(['mainnet', 'preprod', 'preview']),
  chain: z.enum(['ok', 'stale', 'down']),
})

// Temporary fail-closed compatibility with backend revisions before #98/#99.
// Those revisions silently cap this route at exactly 1,000 rows. A legitimate
// complete set of exactly 1,000 is indistinguishable until backend capability
// negotiation lands; mobile#75 owns replacing this conservative workaround.
const LEGACY_BACKEND_UTXO_CAP = 1_000

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

/**
 * Creates the Shelley current-state driver for cardano-wallet-backend.
 *
 * The API shape is one response with no client pagination cursor. This source
 * verifies backend network/readiness on every read and temporarily rejects the
 * legacy 1,000-row cap until backend completeness capability negotiation lands
 * (mobile#75). Validation stays at this boundary so malformed or cross-network
 * data never reaches transaction construction.
 */
export const createCardanoWalletBackendUtxoSource = (
  baseUrl: string,
  expectedNetwork: Chain.SupportedNetworks,
  request: Fetcher = fetcher,
): CurrentStateUtxoSource => {
  const normalizedBaseUrl = trimTrailingSlashes(baseUrl)

  if (normalizedBaseUrl.length === 0) {
    throw new Error('cardano-wallet-backend base URL is required')
  }

  return {
    async getAccountUtxos(stakeAddress) {
      const expectedStakePrefix =
        expectedNetwork === 'mainnet' ? 'stake1' : 'stake_test1'
      if (!stakeAddress.startsWith(expectedStakePrefix)) {
        throw new Error('Stake address does not match the selected network')
      }

      const statusResponse = await request<unknown>({
        url: `${normalizedBaseUrl}/v1/status`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })
      const status = backendStatusSchema.safeParse(statusResponse)
      if (!status.success) {
        throw new Error('Invalid cardano-wallet-backend status response')
      }
      if (status.data.network !== expectedNetwork) {
        throw new Error('cardano-wallet-backend network mismatch')
      }
      if (status.data.chain !== 'ok') {
        throw new Error('cardano-wallet-backend chain data is not ready')
      }

      const response = await request<unknown>({
        url: `${normalizedBaseUrl}/v1/account/${encodeURIComponent(
          stakeAddress,
        )}/utxos`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (
        Array.isArray(response) &&
        response.length >= LEGACY_BACKEND_UTXO_CAP
      ) {
        throw new Error(
          'cardano-wallet-backend account UTxO response may be incomplete',
        )
      }

      const parsed = accountUtxosSchema.safeParse(response)

      if (!parsed.success) {
        throw new Error('Invalid cardano-wallet-backend account UTxO response')
      }

      const expectedAddressPrefix =
        expectedNetwork === 'mainnet' ? 'addr1' : 'addr_test1'
      const seenUtxos = new Set<string>()
      for (const utxo of parsed.data) {
        if (!utxo.address.startsWith(expectedAddressPrefix)) {
          throw new Error(
            'cardano-wallet-backend account UTxO network mismatch',
          )
        }
        const utxoId = `${utxo.txHash}:${utxo.outputIndex}`
        if (seenUtxos.has(utxoId)) {
          throw new Error('Duplicate cardano-wallet-backend account UTxO')
        }
        seenUtxos.add(utxoId)

        const seenAssets = new Set<string>()
        for (const asset of utxo.assets) {
          const assetId = `${asset.policyId}.${asset.assetName}`
          if (seenAssets.has(assetId)) {
            throw new Error(
              'Duplicate asset in cardano-wallet-backend account UTxO',
            )
          }
          seenAssets.add(assetId)
        }
      }

      return parsed.data.map((utxo) => ({
        utxoId: Branded.asUtxoIdFromParts(
          Branded.asTransactionHash(utxo.txHash),
          utxo.outputIndex,
        ),
        txHash: Branded.asTransactionHash(utxo.txHash),
        txIndex: utxo.outputIndex,
        receiver: Branded.asAddress(utxo.address),
        amount: Branded.asBalanceQuantity(utxo.value),
        assets: utxo.assets.map((asset) => ({
          assetId: Branded.asTokenId(`${asset.policyId}.${asset.assetName}`),
          policyId: Branded.asPolicyId(asset.policyId),
          name: Branded.asAssetName(asset.assetName),
          amount: Branded.asBalanceQuantity(asset.quantity),
        })),
        ...(utxo.datumHash === undefined ? {} : {datumHash: utxo.datumHash}),
        ...(utxo.inlineDatum === undefined
          ? {}
          : {inlineDatum: utxo.inlineDatum}),
        ...(utxo.referenceScriptHash === undefined
          ? {}
          : {referenceScriptHash: utxo.referenceScriptHash}),
      }))
    },
  }
}
