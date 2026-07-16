import {Balance, Branded} from '@yoroi/types'

import {CurrentStateUtxo} from './current-state-utxo-source'
import {
  PendingUtxoOverlay,
  applyPendingUtxoOverlays,
  createCurrentStateUtxoService,
} from './pending-utxo-overlay'

const utxo = (txHash: string, txIndex: number): CurrentStateUtxo => ({
  utxoId: Branded.asUtxoId(`${txHash}:${txIndex}`),
  txHash: Branded.asTransactionHash(txHash),
  txIndex,
  receiver: Branded.asAddress('addr_test1wallet'),
  amount: '1000000' as Balance.Quantity,
  assets: [],
})

describe('pending UTxO overlay', () => {
  it('removes pending inputs and exposes wallet-controlled outputs immediately', () => {
    const confirmed = utxo('confirmed', 0)
    const change = utxo('pending', 1)
    const overlay: PendingUtxoOverlay = {
      txHash: Branded.asTransactionHash('pending'),
      spentUtxoIds: [confirmed.utxoId],
      createdUtxos: [change],
    }

    expect(applyPendingUtxoOverlays([confirmed], [overlay])).toEqual([change])
  })

  it('supports chaining through change from an earlier pending transaction', () => {
    const confirmed = utxo('confirmed', 0)
    const firstChange = utxo('first', 1)
    const secondChange = utxo('second', 1)
    const pending: PendingUtxoOverlay[] = [
      {
        txHash: Branded.asTransactionHash('first'),
        spentUtxoIds: [confirmed.utxoId],
        createdUtxos: [firstChange],
      },
      {
        txHash: Branded.asTransactionHash('second'),
        spentUtxoIds: [firstChange.utxoId],
        createdUtxos: [secondChange],
      },
    ]

    expect(applyPendingUtxoOverlays([confirmed], pending)).toEqual([
      secondChange,
    ])
  })

  it('does not duplicate an output already observed by the backend', () => {
    const observed = utxo('pending', 1)
    const overlay: PendingUtxoOverlay = {
      txHash: Branded.asTransactionHash('pending'),
      spentUtxoIds: [],
      createdUtxos: [observed],
    }

    expect(applyPendingUtxoOverlays([observed], [overlay])).toEqual([observed])
  })

  it('refreshes authoritative state on every service read', async () => {
    const first = utxo('first', 0)
    const refreshed = utxo('refreshed', 0)
    const source = {
      getAccountUtxos: jest
        .fn()
        .mockResolvedValueOnce([first])
        .mockResolvedValueOnce([refreshed]),
    }
    const pendingStore = {
      getPendingUtxoOverlays: jest.fn(async () => []),
    }
    const service = createCurrentStateUtxoService(source, pendingStore)
    const stakeAddress = Branded.asStakingAddress('stake_test1account')

    await expect(service.getAvailableUtxos(stakeAddress)).resolves.toEqual([
      first,
    ])
    await expect(service.getAvailableUtxos(stakeAddress)).resolves.toEqual([
      refreshed,
    ])
  })
})
