import {Fetcher, fetcher} from '@yoroi/common'
import {
  Address,
  Balance,
  Branded,
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
  datumHash: hex.optional(),
  inlineDatum: hex.optional(),
  referenceScriptHash: hex.optional(),
})

const accountUtxosSchema = z.array(accountUtxoSchema)

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '')

/**
 * Creates the Shelley current-state driver for cardano-wallet-backend.
 *
 * The endpoint returns the complete account UTxO set in one response; it has no
 * pagination cursor. Validation stays at this boundary so malformed upstream
 * data never reaches transaction construction.
 */
export const createCardanoWalletBackendUtxoSource = (
  baseUrl: string,
  request: Fetcher = fetcher,
): CurrentStateUtxoSource => {
  const normalizedBaseUrl = trimTrailingSlashes(baseUrl)

  if (normalizedBaseUrl.length === 0) {
    throw new Error('cardano-wallet-backend base URL is required')
  }

  return {
    async getAccountUtxos(stakeAddress) {
      const response = await request<unknown>({
        url: `${normalizedBaseUrl}/v1/account/${encodeURIComponent(
          stakeAddress,
        )}/utxos`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })
      const parsed = accountUtxosSchema.safeParse(response)

      if (!parsed.success) {
        throw new Error('Invalid cardano-wallet-backend account UTxO response')
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
