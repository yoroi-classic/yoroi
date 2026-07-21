import {StakingAddress, TransactionHash, UtxoId} from '@yoroi/types'

import {
  CurrentStateUtxo,
  CurrentStateUtxoSource,
} from './current-state-utxo-source'

export type PendingUtxoOverlay = {
  readonly txHash: TransactionHash
  readonly spentUtxoIds: ReadonlyArray<UtxoId>
  readonly createdUtxos: ReadonlyArray<CurrentStateUtxo>
}

export type PendingUtxoOverlayStore = {
  getPendingUtxoOverlaysInSubmissionOrder(
    stakeAddress: StakingAddress,
  ): Promise<ReadonlyArray<PendingUtxoOverlay>>
}

const sameUtxo = (left: CurrentStateUtxo, right: CurrentStateUtxo): boolean => {
  if (
    left.utxoId !== right.utxoId ||
    left.txHash !== right.txHash ||
    left.txIndex !== right.txIndex ||
    left.receiver !== right.receiver ||
    left.amount !== right.amount ||
    left.datumHash !== right.datumHash ||
    left.inlineDatum !== right.inlineDatum ||
    left.referenceScriptHash !== right.referenceScriptHash ||
    left.assets.length !== right.assets.length
  ) {
    return false
  }

  const leftAssets = new Map(left.assets.map((asset) => [asset.assetId, asset]))
  const rightAssets = new Map(
    right.assets.map((asset) => [asset.assetId, asset]),
  )
  return (
    leftAssets.size === left.assets.length &&
    rightAssets.size === right.assets.length &&
    right.assets.every((asset) => {
      const matching = leftAssets.get(asset.assetId)
      return (
        matching !== undefined &&
        matching.policyId === asset.policyId &&
        matching.name === asset.name &&
        matching.amount === asset.amount
      )
    })
  )
}

/**
 * Applies pending transactions in submission order over authoritative state.
 *
 * A later pending transaction can consume an output created by an earlier one.
 * Replacing by UTxO id also makes reconciliation idempotent when the backend has
 * already observed a created output but the local status poll has not yet
 * removed its pending overlay.
 */
export const applyPendingUtxoOverlays = (
  authoritativeUtxos: ReadonlyArray<CurrentStateUtxo>,
  pending: ReadonlyArray<PendingUtxoOverlay>,
): ReadonlyArray<CurrentStateUtxo> => {
  const available = new Map<UtxoId, CurrentStateUtxo>(
    authoritativeUtxos.map((utxo) => [utxo.utxoId, utxo]),
  )

  for (const transaction of pending) {
    for (const spentUtxoId of transaction.spentUtxoIds) {
      available.delete(spentUtxoId)
    }
    for (const createdUtxo of transaction.createdUtxos) {
      if (
        new Set(createdUtxo.assets.map((asset) => asset.assetId)).size !==
        createdUtxo.assets.length
      ) {
        throw new Error('Duplicate asset in pending UTxO overlay')
      }
      const existing = available.get(createdUtxo.utxoId)
      if (existing !== undefined && !sameUtxo(existing, createdUtxo)) {
        throw new Error('Conflicting pending UTxO overlay')
      }
      available.set(createdUtxo.utxoId, createdUtxo)
    }
  }

  return [...available.values()]
}

export const createCurrentStateUtxoService = (
  source: CurrentStateUtxoSource,
  pendingStore: PendingUtxoOverlayStore,
) => ({
  async getAvailableUtxos(
    stakeAddress: StakingAddress,
  ): Promise<ReadonlyArray<CurrentStateUtxo>> {
    const [authoritative, pending] = await Promise.all([
      source.getAccountUtxos(stakeAddress),
      pendingStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ])

    const expectedAddressPrefix = stakeAddress.startsWith('stake_test1')
      ? 'addr_test1'
      : stakeAddress.startsWith('stake1')
        ? 'addr1'
        : undefined
    if (
      expectedAddressPrefix === undefined ||
      pending.some((overlay) =>
        overlay.createdUtxos.some(
          (utxo) => !utxo.receiver.startsWith(expectedAddressPrefix),
        ),
      )
    ) {
      throw new Error('Pending UTxO overlay network mismatch')
    }

    return applyPendingUtxoOverlays(authoritative, pending)
  },
})
