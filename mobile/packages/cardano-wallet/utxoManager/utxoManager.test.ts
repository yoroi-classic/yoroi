import {
  CurrentStateWalletSource,
  PendingUtxoOverlay,
  UtxoDiffToBestBlock,
  createPersistentPendingUtxoOverlayStore,
} from '@yoroi/tx'
import {Balance, BlockHash, Branded} from '@yoroi/types'

import {rootStorage} from '~/kernel/storage/storages'

import {
  makeCurrentStateUtxoManager,
  makeUtxoManagerStorage,
  makeUtxoStorage,
} from './utxoManager'

describe('current-state UTxO manager', () => {
  const stakeAddress = Branded.asStakingAddress('stake_test1account')

  it('replaces cached state, retains it on failure, and restores it after restart', async () => {
    const accountStorage = rootStorage.join('current-state-manager-test/')
    await accountStorage.clear()
    const storage = accountStorage.join('utxos/')
    const pendingStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const cachedUtxo = {
      utxoId: Branded.asUtxoId(`${'a'.repeat(64)}:0`),
      txHash: Branded.asTransactionHash('a'.repeat(64)),
      txIndex: 0,
      receiver: Branded.asAddress('addr_test1receiver'),
      amount: '1234567' as Balance.Quantity,
      assets: [],
      datumHash: 'd'.repeat(64),
      inlineDatum: '80',
      referenceScriptHash: 'e'.repeat(56),
    }
    const replacementUtxo = {
      ...cachedUtxo,
      utxoId: Branded.asUtxoId(`${'b'.repeat(64)}:1`),
      txHash: Branded.asTransactionHash('b'.repeat(64)),
      txIndex: 1,
    }
    const source: CurrentStateWalletSource = {
      getChainTip: jest.fn().mockResolvedValue({
        bestBlock: {
          height: 1,
          slot: 1,
          epoch: 1,
          hash: 'c'.repeat(64),
          globalSlot: null,
        },
      }),
      getAccountUtxos: jest
        .fn()
        .mockResolvedValueOnce([cachedUtxo])
        .mockResolvedValueOnce([replacementUtxo])
        .mockRejectedValueOnce(new Error('backend unavailable')),
    }
    const manager = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore,
      stakeAddress,
    })

    await manager.sync([])
    expect(await manager.getCachedUtxos()).toEqual([
      expect.objectContaining({
        utxo_id: cachedUtxo.utxoId,
        datumHash: cachedUtxo.datumHash,
        inlineDatum: cachedUtxo.inlineDatum,
        referenceScriptHash: cachedUtxo.referenceScriptHash,
      }),
    ])
    await manager.sync([])
    expect(await manager.getCachedUtxos()).toEqual([
      expect.objectContaining({utxo_id: replacementUtxo.utxoId}),
    ])
    await expect(manager.sync([])).rejects.toThrow('backend unavailable')
    expect(await manager.getCachedUtxos()).toEqual([
      expect.objectContaining({utxo_id: replacementUtxo.utxoId}),
    ])

    const restored = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore: createPersistentPendingUtxoOverlayStore(accountStorage),
      stakeAddress,
    })
    expect(restored.initialUtxos).toEqual([
      expect.objectContaining({utxo_id: replacementUtxo.utxoId}),
    ])
    expect(source.getAccountUtxos).toHaveBeenCalledTimes(3)
  })

  it('rehydrates a pending spend/change overlay after restart', async () => {
    const accountStorage = rootStorage.join('current-state-overlay-test/')
    await accountStorage.clear()
    const storage = accountStorage.join('utxos/')
    const pendingStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const authoritative = {
      utxoId: Branded.asUtxoId(`${'a'.repeat(64)}:0`),
      txHash: Branded.asTransactionHash('a'.repeat(64)),
      txIndex: 0,
      receiver: Branded.asAddress('addr_test1receiver'),
      amount: '1234567' as Balance.Quantity,
      assets: [],
    }
    const txHash = 'b'.repeat(64)
    const change = {
      utxoId: Branded.asUtxoId(`${txHash}:1`),
      txHash: Branded.asTransactionHash(txHash),
      txIndex: 1,
      receiver: Branded.asAddress('addr_test1change'),
      amount: '1000000' as Balance.Quantity,
      assets: [],
    }
    const pending: PendingUtxoOverlay = {
      txHash: Branded.asTransactionHash(txHash),
      spentUtxoIds: [authoritative.utxoId],
      createdUtxos: [change],
    }
    const source: CurrentStateWalletSource = {
      getChainTip: jest.fn().mockResolvedValue({
        bestBlock: {
          height: 1,
          slot: 1,
          epoch: 1,
          hash: 'c'.repeat(64),
          globalSlot: null,
        },
      }),
      getAccountUtxos: jest
        .fn()
        .mockResolvedValueOnce([authoritative])
        .mockResolvedValueOnce([change]),
    }
    const manager = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore,
      stakeAddress,
    })
    await manager.sync([])
    await pendingStore.savePendingUtxoOverlay(stakeAddress, pending)

    const restored = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore: createPersistentPendingUtxoOverlayStore(accountStorage),
      stakeAddress,
    })
    expect(restored.initialUtxos).toEqual([
      expect.objectContaining({utxo_id: change.utxoId}),
    ])
    await restored.sync([])
    await expect(restored.getCachedUtxos()).resolves.toEqual([
      expect.objectContaining({utxo_id: change.utxoId}),
    ])
    expect(
      await createPersistentPendingUtxoOverlayStore(
        accountStorage,
      ).getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).toEqual([])
    expect(source.getAccountUtxos).toHaveBeenCalledTimes(2)
  })

  it('drops a pending overlay once inputs disappear even if its outputs were spent', async () => {
    const accountStorage = rootStorage.join('current-state-spent-overlay-test/')
    await accountStorage.clear()
    const storage = accountStorage.join('utxos/')
    const pendingStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const input = {
      utxoId: Branded.asUtxoId(`${'a'.repeat(64)}:0`),
      txHash: Branded.asTransactionHash('a'.repeat(64)),
      txIndex: 0,
      receiver: Branded.asAddress('addr_test1receiver'),
      amount: '1234567' as Balance.Quantity,
      assets: [],
    }
    const change = {
      ...input,
      utxoId: Branded.asUtxoId(`${'b'.repeat(64)}:1`),
      txHash: Branded.asTransactionHash('b'.repeat(64)),
      txIndex: 1,
    }
    const source: CurrentStateWalletSource = {
      getChainTip: jest.fn().mockResolvedValue({
        bestBlock: {
          height: 1,
          slot: 1,
          epoch: 1,
          hash: 'c'.repeat(64),
          globalSlot: null,
        },
      }),
      getAccountUtxos: jest
        .fn()
        .mockResolvedValueOnce([input])
        .mockResolvedValueOnce([]),
    }
    const manager = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore,
      stakeAddress,
    })
    await manager.sync([])
    const pending: PendingUtxoOverlay = {
      txHash: change.txHash,
      spentUtxoIds: [input.utxoId],
      createdUtxos: [change],
    }
    await manager.savePendingOverlay(pending)

    await manager.sync([])

    await expect(manager.getCachedUtxos()).resolves.toEqual([])
    await expect(
      pendingStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([])
  })

  it('expires a pending overlay after its TTL when the backend still reports its inputs', async () => {
    const accountStorage = rootStorage.join(
      'current-state-expired-overlay-test/',
    )
    await accountStorage.clear()
    const storage = accountStorage.join('utxos/')
    const pendingStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const input = {
      utxoId: Branded.asUtxoId(`${'a'.repeat(64)}:0`),
      txHash: Branded.asTransactionHash('a'.repeat(64)),
      txIndex: 0,
      receiver: Branded.asAddress('addr_test1receiver'),
      amount: '1234567' as Balance.Quantity,
      assets: [],
    }
    const change = {
      ...input,
      utxoId: Branded.asUtxoId(`${'b'.repeat(64)}:1`),
      txHash: Branded.asTransactionHash('b'.repeat(64)),
      txIndex: 1,
    }
    const source: CurrentStateWalletSource = {
      getChainTip: jest.fn().mockResolvedValue({
        bestBlock: {
          height: 2,
          slot: 11,
          epoch: 1,
          hash: 'c'.repeat(64),
          globalSlot: null,
        },
      }),
      getAccountUtxos: jest.fn().mockResolvedValue([input]),
    }
    const manager = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore,
      stakeAddress,
    })
    await manager.sync([])
    await manager.savePendingOverlay({
      txHash: change.txHash,
      ttlSlot: '10',
      spentUtxoIds: [input.utxoId],
      createdUtxos: [change],
    })

    await manager.sync([])

    await expect(manager.getCachedUtxos()).resolves.toEqual([
      expect.objectContaining({utxo_id: input.utxoId}),
    ])
    await expect(
      pendingStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([])
  })

  it('does not commit a new snapshot when the chain tip needed for expiry fails', async () => {
    const accountStorage = rootStorage.join('current-state-tip-failure-test/')
    await accountStorage.clear()
    const storage = accountStorage.join('utxos/')
    const pendingStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const input = {
      utxoId: Branded.asUtxoId(`${'a'.repeat(64)}:0`),
      txHash: Branded.asTransactionHash('a'.repeat(64)),
      txIndex: 0,
      receiver: Branded.asAddress('addr_test1receiver'),
      amount: '1234567' as Balance.Quantity,
      assets: [],
    }
    const replacement = {
      ...input,
      utxoId: Branded.asUtxoId(`${'b'.repeat(64)}:1`),
      txHash: Branded.asTransactionHash('b'.repeat(64)),
      txIndex: 1,
    }
    const source: CurrentStateWalletSource = {
      getChainTip: jest.fn().mockRejectedValue(new Error('tip unavailable')),
      getAccountUtxos: jest
        .fn()
        .mockResolvedValueOnce([input])
        .mockResolvedValueOnce([input, replacement]),
    }
    const manager = await makeCurrentStateUtxoManager({
      storage,
      source,
      pendingStore,
      stakeAddress,
    })
    await manager.sync([])
    await manager.savePendingOverlay({
      txHash: replacement.txHash,
      ttlSlot: '10',
      spentUtxoIds: [input.utxoId],
      createdUtxos: [replacement],
    })

    await expect(manager.sync([])).rejects.toThrow('tip unavailable')

    await expect(
      storage.getItem('current-state-cache', (value) =>
        value == null ? [] : (JSON.parse(value) as Array<{utxoId: string}>),
      ),
    ).resolves.toEqual([expect.objectContaining({utxoId: input.utxoId})])
  })
})

describe('utxo manager storage', () => {
  it('addrCounter works', async () => {
    const storage = rootStorage.join('utxos/')
    const {addrCounter} = makeUtxoManagerStorage(storage)

    // initial
    await addrCounter.read().then((addrCounter) => {
      return expect(addrCounter).toEqual(0)
    })

    await addrCounter.save(1)
    await addrCounter.read().then((addrCounter) => {
      return expect(addrCounter).toEqual(1)
    })

    await addrCounter.clear()
    await addrCounter.read().then((addrCounter) => {
      return expect(addrCounter).toEqual(0)
    })
  })
  it('collateral works', async () => {
    const storage = rootStorage.join('utxos/')
    const {collateral} = makeUtxoManagerStorage(storage)

    // initial
    await collateral.read().then((collateral) => {
      return expect(collateral).toEqual('')
    })

    await collateral.save('id#0')
    await collateral.read().then((collateral) => {
      return expect(collateral).toEqual('id#0')
    })

    await collateral.clear()
    await collateral.read().then((collateral) => {
      return expect(collateral).toEqual('')
    })
  })
})

describe('utxo storage', () => {
  it('works', async () => {
    const storage = rootStorage.join('utxos/')

    const {
      getUtxoDiffToBestBlock,
      getUtxoAtSafePoint,
      replaceUtxoAtSafePoint,
      appendUtxoDiffToBestBlock,
      removeDiffWithBestBlock,
      clearUtxoState,
    } = makeUtxoStorage(storage)

    // initial
    await getUtxoDiffToBestBlock().then((safePoint) => {
      return expect(safePoint).toEqual([])
    })
    await getUtxoAtSafePoint().then((safePoint) => {
      return expect(safePoint).toEqual(undefined)
    })

    await replaceUtxoAtSafePoint(
      utxoAtSafePoint1.utxos,
      utxoAtSafePoint1.lastSafeBlockHash,
    )
    await getUtxoAtSafePoint().then((safePoint) => {
      return expect(safePoint).toEqual(utxoAtSafePoint1)
    })

    await replaceUtxoAtSafePoint(
      utxoAtSafePoint2.utxos,
      utxoAtSafePoint2.lastSafeBlockHash,
    )
    await getUtxoAtSafePoint().then((safePoint) => {
      return expect(safePoint).toEqual(utxoAtSafePoint2)
    })

    await appendUtxoDiffToBestBlock(utxoDiff1)
    await getUtxoDiffToBestBlock().then((diff) => {
      return expect(diff).toEqual([utxoDiff1])
    })

    // does not append duplicates
    await appendUtxoDiffToBestBlock(utxoDiff1)
    await getUtxoDiffToBestBlock().then((diff) => {
      return expect(diff).toEqual([utxoDiff1])
    })

    await appendUtxoDiffToBestBlock(utxoDiff2)
    await getUtxoDiffToBestBlock().then((diff) => {
      return expect(diff).toEqual([utxoDiff1, utxoDiff2])
    })

    await removeDiffWithBestBlock(utxoDiff2.lastBestBlockHash)
    await getUtxoDiffToBestBlock().then((diff) => {
      return expect(diff).toEqual([utxoDiff1])
    })

    await clearUtxoState()
    await getUtxoAtSafePoint().then((safePoint) => {
      return expect(safePoint).toEqual(undefined)
    })
    await getUtxoDiffToBestBlock().then((diff) => {
      return expect(diff).toEqual([])
    })
  })
})

const utxoAtSafePoint1 = {
  lastSafeBlockHash: 'lastSafeBlockHash - 1',
  utxos: [],
}
const utxoAtSafePoint2 = {
  lastSafeBlockHash: 'lastSafeBlockHash - 2',
  utxos: [],
}

const utxoDiff1: UtxoDiffToBestBlock = {
  lastBestBlockHash: 'lastBestBlockHash - 1' as BlockHash,
  newUtxos: [],
  spentUtxoIds: [],
}
const utxoDiff2: UtxoDiffToBestBlock = {
  lastBestBlockHash: 'lastBestBlockHash - 2' as BlockHash,
  spentUtxoIds: [],
  newUtxos: [],
}
