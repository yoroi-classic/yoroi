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
  getPendingUtxoOverlays(
    stakeAddress: StakingAddress,
  ): Promise<ReadonlyArray<PendingUtxoOverlay>>
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
      pendingStore.getPendingUtxoOverlays(stakeAddress),
    ])

    return applyPendingUtxoOverlays(authoritative, pending)
  },
})
