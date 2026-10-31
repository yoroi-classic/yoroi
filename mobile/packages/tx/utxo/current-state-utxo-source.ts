import {SyncTipStatus} from '@yoroi/api'
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
 * point. `/v1/account/{stake}/utxos/complete` answers what the account
 * controls now and includes the backend's completeness proof.
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

export type CurrentStateWalletSource = CurrentStateUtxoSource & {
  getChainTip(): Promise<SyncTipStatus>
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

const completeAccountUtxosSchema = z.object({
  complete: z.literal(true),
  utxos: z.array(accountUtxoSchema),
})
const backendStatusSchema = z.object({
  // Keep this boundary free of runtime access to the @yoroi/types namespace.
  // Some consumers intentionally provide type-only mocks of that package.
  network: z.enum(['mainnet', 'preprod', 'preview']),
  chain: z.enum(['ok', 'stale', 'down']),
})
const chainTipSchema = z.object({
  block: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
  epoch: z.number().int().nonnegative(),
  hash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  blockTime: z.number().int().nonnegative(),
})

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

/**
 * Creates the Shelley current-state driver for cardano-wallet-backend.
 *
 * The API shape is one response with no client pagination cursor. This source
 * verifies backend network/readiness on every read and requires the backend's
 * completeness marker. A complete set of exactly 1,000 rows is valid;
 * completeness is established by the backend marker, not inferred from array
 * length. Validation stays at this boundary so partial, malformed, stale, or
 * cross-network data never reaches transaction construction.
 */
export const createCardanoWalletBackendUtxoSource = (
  baseUrl: string,
  expectedNetwork: Chain.SupportedNetworks,
  request: Fetcher = fetcher,
): CurrentStateWalletSource => {
  const normalizedBaseUrl = trimTrailingSlashes(baseUrl)

  if (normalizedBaseUrl.length === 0) {
    throw new Error('cardano-wallet-backend base URL is required')
  }

  const assertBackendReady = async () => {
    const statusResponse = await request<unknown>({
      url: `${normalizedBaseUrl}/v1/status`,
      method: 'GET',
      headers: {Accept: 'application/json'},
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
  }

  return {
    async getChainTip() {
      await assertBackendReady()
      const response = await request<unknown>({
        url: `${normalizedBaseUrl}/v1/chain/tip`,
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      const parsed = chainTipSchema.safeParse(response)
      if (!parsed.success) {
        throw new Error('Invalid cardano-wallet-backend chain tip response')
      }
      const bestBlock = {
        height: parsed.data.block,
        slot: Branded.asSlotNumber(parsed.data.slot),
        epoch: Branded.asEpochNumber(parsed.data.epoch),
        hash: Branded.asBlockHash(parsed.data.hash.toLowerCase()),
        globalSlot: null,
      }
      return {bestBlock}
    },
    async getAccountUtxos(stakeAddress) {
      const expectedStakePrefix =
        expectedNetwork === 'mainnet' ? 'stake1' : 'stake_test1'
      if (!stakeAddress.startsWith(expectedStakePrefix)) {
        throw new Error('Stake address does not match the selected network')
      }

      await assertBackendReady()

      const response = await request<unknown>({
        url: `${normalizedBaseUrl}/v1/account/${encodeURIComponent(
          stakeAddress,
        )}/utxos/complete`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      const parsed = completeAccountUtxosSchema.safeParse(response)

      if (!parsed.success) {
        throw new Error(
          'Invalid or incomplete cardano-wallet-backend account UTxO response',
        )
      }

      const expectedAddressPrefix =
        expectedNetwork === 'mainnet' ? 'addr1' : 'addr_test1'
      const seenUtxos = new Set<string>()
      for (const utxo of parsed.data.utxos) {
        if (!utxo.address.startsWith(expectedAddressPrefix)) {
          throw new Error(
            'cardano-wallet-backend account UTxO network mismatch',
          )
        }
        const utxoId = `${utxo.txHash.toLowerCase()}:${utxo.outputIndex}`
        if (seenUtxos.has(utxoId)) {
          throw new Error('Duplicate cardano-wallet-backend account UTxO')
        }
        seenUtxos.add(utxoId)

        const seenAssets = new Set<string>()
        for (const asset of utxo.assets) {
          const assetId = `${asset.policyId.toLowerCase()}.${asset.assetName.toLowerCase()}`
          if (seenAssets.has(assetId)) {
            throw new Error(
              'Duplicate asset in cardano-wallet-backend account UTxO',
            )
          }
          seenAssets.add(assetId)
        }
      }

      return parsed.data.utxos.map((utxo) => ({
        utxoId: Branded.asUtxoIdFromParts(
          Branded.asTransactionHash(utxo.txHash.toLowerCase()),
          utxo.outputIndex,
        ),
        txHash: Branded.asTransactionHash(utxo.txHash.toLowerCase()),
        txIndex: utxo.outputIndex,
        receiver: Branded.asAddress(utxo.address),
        amount: Branded.asBalanceQuantity(utxo.value),
        assets: utxo.assets.map((asset) => ({
          assetId: Branded.asTokenId(
            `${asset.policyId.toLowerCase()}.${asset.assetName.toLowerCase()}`,
          ),
          policyId: Branded.asPolicyId(asset.policyId.toLowerCase()),
          name: Branded.asAssetName(asset.assetName.toLowerCase()),
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
