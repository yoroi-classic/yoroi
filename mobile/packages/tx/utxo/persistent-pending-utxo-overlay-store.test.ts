import {App, Balance, Branded} from '@yoroi/types'

import {CurrentStateUtxo} from './current-state-utxo-source'
import {PendingUtxoOverlay} from './pending-utxo-overlay'
import {createPersistentPendingUtxoOverlayStore} from './persistent-pending-utxo-overlay-store'

const hash = (value: string) => value.repeat(64)
const stakeAddress = Branded.asStakingAddress('stake_test1walletaccount')

const utxo = (
  txHash: string,
  txIndex: number,
  amount = '184467440737095516151234567890',
): CurrentStateUtxo => ({
  utxoId: Branded.asUtxoId(`${txHash}:${txIndex}`),
  txHash: Branded.asTransactionHash(txHash),
  txIndex,
  receiver: Branded.asAddress('addr_test1walletchange'),
  amount: amount as Balance.Quantity,
  assets: [
    {
      assetId: Branded.asTokenId(`${'c'.repeat(56)}.00ff`),
      policyId: Branded.asPolicyId('c'.repeat(56)),
      name: Branded.asAssetName('00ff'),
      amount: '999999999999999999999999999999' as Balance.Quantity,
    },
  ],
  datumHash: 'd'.repeat(64),
  inlineDatum: '80',
  referenceScriptHash: 'e'.repeat(56),
})

const overlay = (
  txHash: string,
  spentHash: string,
  txIndex = 0,
): PendingUtxoOverlay => ({
  txHash: Branded.asTransactionHash(txHash),
  spentUtxoIds: [Branded.asUtxoId(`${spentHash}:0`)],
  createdUtxos: [utxo(txHash, txIndex)],
})

describe('persistent pending UTxO overlay store', () => {
  it('rehydrates versioned overlays in submission order with exact quantities', async () => {
    const root = makeMemoryStorage()
    const accountStorage = root.join('wallet-a/accounts/0/')
    const first = overlay(hash('a'), hash('1'))
    const second = overlay(hash('b'), hash('2'), 1)

    const writer = createPersistentPendingUtxoOverlayStore(accountStorage)
    await writer.savePendingUtxoOverlay(stakeAddress, first)
    await writer.savePendingUtxoOverlay(stakeAddress, second)

    const rehydrated = createPersistentPendingUtxoOverlayStore(accountStorage)
    await expect(
      rehydrated.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([first, second])

    const raw = await accountStorage
      .join('pending-utxo-overlays/')
      .getItem<Record<string, unknown>>('state.v1')
    expect(raw).toMatchObject({version: 1})
    expect(JSON.stringify(raw)).toContain('184467440737095516151234567890')
    expect(JSON.stringify(raw)).toContain('999999999999999999999999999999')
  })

  it('serializes concurrent writes so neither overlay is lost', async () => {
    const store = createPersistentPendingUtxoOverlayStore(
      makeMemoryStorage().join('wallet-a/accounts/0/'),
    )
    const first = overlay(hash('a'), hash('1'))
    const second = overlay(hash('b'), hash('2'))

    await Promise.all([
      store.savePendingUtxoOverlay(stakeAddress, first),
      store.savePendingUtxoOverlay(stakeAddress, second),
    ])

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([first, second])
  })

  it('serializes concurrent writes across distinct store instances', async () => {
    const accountStorage = makeMemoryStorage().join('wallet-a/accounts/0/')
    const firstStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const secondStore = createPersistentPendingUtxoOverlayStore(accountStorage)
    const first = overlay(hash('a'), hash('1'))
    const second = overlay(hash('b'), hash('2'))

    await Promise.all([
      firstStore.savePendingUtxoOverlay(stakeAddress, first),
      secondStore.savePendingUtxoOverlay(stakeAddress, second),
    ])

    await expect(
      firstStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([first, second])
  })

  it('keeps wallet and account storage roots isolated', async () => {
    const root = makeMemoryStorage()
    const firstAccount = createPersistentPendingUtxoOverlayStore(
      root.join('wallet-a/accounts/0/'),
    )
    const secondAccount = createPersistentPendingUtxoOverlayStore(
      root.join('wallet-a/accounts/1/'),
    )
    const otherWallet = createPersistentPendingUtxoOverlayStore(
      root.join('wallet-b/accounts/0/'),
    )
    const pending = overlay(hash('a'), hash('1'))

    await firstAccount.savePendingUtxoOverlay(stakeAddress, pending)

    await expect(
      firstAccount.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([pending])
    await expect(
      secondAccount.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([])
    await expect(
      otherWallet.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([])
  })

  it('is idempotent by transaction hash and rejects conflicting content', async () => {
    const store = createPersistentPendingUtxoOverlayStore(makeMemoryStorage())
    const pending = overlay(hash('a'), hash('1'))
    await store.savePendingUtxoOverlay(stakeAddress, pending)
    await store.savePendingUtxoOverlay(stakeAddress, pending)

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([pending])
    await expect(
      store.savePendingUtxoOverlay(stakeAddress, {
        ...pending,
        spentUtxoIds: [Branded.asUtxoId(`${hash('2')}:0`)],
      }),
    ).rejects.toThrow('Conflicting pending UTxO overlay for transaction')
  })

  it('canonicalizes equivalent mixed-case hex identifiers before deduplication', async () => {
    const store = createPersistentPendingUtxoOverlayStore(makeMemoryStorage())
    const lowercase = overlay(hash('a'), hash('b'))
    const uppercase: PendingUtxoOverlay = {
      ...lowercase,
      txHash: Branded.asTransactionHash(lowercase.txHash.toUpperCase()),
      spentUtxoIds: lowercase.spentUtxoIds.map((id) =>
        Branded.asUtxoId(id.toUpperCase()),
      ),
      createdUtxos: lowercase.createdUtxos.map((created) => ({
        ...created,
        utxoId: Branded.asUtxoId(created.utxoId.toUpperCase()),
        txHash: Branded.asTransactionHash(created.txHash.toUpperCase()),
        assets: created.assets.map((asset) => ({
          ...asset,
          assetId: Branded.asTokenId(asset.assetId.toUpperCase()),
          policyId: Branded.asPolicyId(asset.policyId.toUpperCase()),
          name: Branded.asAssetName(asset.name.toUpperCase()),
        })),
        datumHash: created.datumHash?.toUpperCase(),
        inlineDatum: created.inlineDatum?.toUpperCase(),
        referenceScriptHash: created.referenceScriptHash?.toUpperCase(),
      })),
    }

    await store.savePendingUtxoOverlay(stakeAddress, uppercase)
    await store.savePendingUtxoOverlay(stakeAddress, lowercase)

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([lowercase])
  })

  it('treats reordered overlay sets as an idempotent retry', async () => {
    const store = createPersistentPendingUtxoOverlayStore(makeMemoryStorage())
    const firstCreated = utxo(hash('a'), 0)
    const secondCreated = {
      ...utxo(hash('a'), 1),
      assets: [
        {
          assetId: Branded.asTokenId(`${'f'.repeat(56)}.01`),
          policyId: Branded.asPolicyId('f'.repeat(56)),
          name: Branded.asAssetName('01'),
          amount: '42' as Balance.Quantity,
        },
        ...firstCreated.assets,
      ],
    }
    const original: PendingUtxoOverlay = {
      txHash: Branded.asTransactionHash(hash('a')),
      spentUtxoIds: [
        Branded.asUtxoId(`${hash('1')}:0`),
        Branded.asUtxoId(`${hash('2')}:1`),
      ],
      createdUtxos: [firstCreated, secondCreated],
    }
    const reordered: PendingUtxoOverlay = {
      ...original,
      spentUtxoIds: [...original.spentUtxoIds].reverse(),
      createdUtxos: [
        {...secondCreated, assets: [...secondCreated.assets].reverse()},
        firstCreated,
      ],
    }

    await store.savePendingUtxoOverlay(stakeAddress, original)
    await store.savePendingUtxoOverlay(stakeAddress, reordered)

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([original])
  })

  it('supports reconciliation replacement, removal, and lifecycle clearing', async () => {
    const store = createPersistentPendingUtxoOverlayStore(makeMemoryStorage())
    const first = overlay(hash('a'), hash('1'))
    const second = overlay(hash('b'), hash('2'))
    await store.replacePendingUtxoOverlays(stakeAddress, [first, second])
    await store.removePendingUtxoOverlay(stakeAddress, first.txHash)

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([second])

    await store.clearPendingUtxoOverlays(stakeAddress)
    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([])

    await store.savePendingUtxoOverlay(stakeAddress, first)
    await store.clearPendingUtxoOverlaysForFullResync()
    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([])
  })

  it('fails closed on unsupported or malformed persisted state', async () => {
    const accountStorage = makeMemoryStorage()
    const storage = accountStorage.join('pending-utxo-overlays/')
    const store = createPersistentPendingUtxoOverlayStore(accountStorage)

    await storage.setItem('state.v1', {
      version: 2,
      overlaysByStakeAddress: {},
    })
    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).rejects.toThrow('Invalid persisted pending UTxO overlay state')

    await storage.setItem('state.v1', {
      version: 1,
      overlaysByStakeAddress: {
        [stakeAddress]: [
          {
            ...overlay(hash('a'), hash('1')),
            createdUtxos: [{...utxo(hash('a'), 0), amount: 9007199254740992}],
          },
        ],
      },
    })
    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).rejects.toThrow('Invalid persisted pending UTxO overlay state')
  })

  it('rejects malformed writes without damaging existing state', async () => {
    const store = createPersistentPendingUtxoOverlayStore(makeMemoryStorage())
    const valid = overlay(hash('a'), hash('1'))
    await store.savePendingUtxoOverlay(stakeAddress, valid)

    await expect(
      store.savePendingUtxoOverlay(stakeAddress, {
        ...overlay(hash('b'), hash('2')),
        createdUtxos: [
          {
            ...utxo(hash('b'), 0),
            amount: '01' as Balance.Quantity,
          },
        ],
      }),
    ).rejects.toThrow('Invalid pending UTxO overlay')
    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([valid])
  })

  it('continues serialized mutations after a rejected write', async () => {
    const store = createPersistentPendingUtxoOverlayStore(makeMemoryStorage())
    const first = overlay(hash('a'), hash('1'))
    const second = overlay(hash('b'), hash('2'))
    await store.savePendingUtxoOverlay(stakeAddress, first)

    await expect(
      store.savePendingUtxoOverlay(stakeAddress, {
        ...second,
        txHash: Branded.asTransactionHash('not-a-transaction-hash'),
      }),
    ).rejects.toThrow('Invalid pending UTxO overlay')
    await store.savePendingUtxoOverlay(stakeAddress, second)

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).resolves.toEqual([first, second])
  })

  it.each([
    {
      name: 'a duplicate transaction hash',
      overlays: [
        overlay(hash('a'), hash('1')),
        {
          ...overlay(hash('a'), hash('2')),
          txHash: Branded.asTransactionHash(hash('A')),
          createdUtxos: [utxo(hash('A'), 0)],
        },
      ],
    },
    {
      name: 'a mismatched output reference',
      overlays: [
        {
          ...overlay(hash('a'), hash('1')),
          createdUtxos: [
            {
              ...utxo(hash('a'), 0),
              utxoId: Branded.asUtxoId(`${hash('b')}:0`),
            },
          ],
        },
      ],
    },
    {
      name: 'a cross-network output',
      overlays: [
        {
          ...overlay(hash('a'), hash('1')),
          createdUtxos: [
            {
              ...utxo(hash('a'), 0),
              receiver: Branded.asAddress('addr1mainnetchange'),
            },
          ],
        },
      ],
    },
  ])('fails closed when persisted state contains $name', async ({overlays}) => {
    const accountStorage = makeMemoryStorage()
    const storage = accountStorage.join('pending-utxo-overlays/')
    const store = createPersistentPendingUtxoOverlayStore(accountStorage)

    await storage.setItem('state.v1', {
      version: 1,
      overlaysByStakeAddress: {[stakeAddress]: overlays},
    })

    await expect(
      store.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress),
    ).rejects.toThrow('Invalid persisted pending UTxO overlay state')
  })
})

const makeMemoryStorage = (
  data = new Map<string, string>(),
  path = '/',
): App.Storage => {
  const absolute = (key: string) => `${path}${key}`
  const storage = {
    join: (folder: App.StorageFolderName) =>
      makeMemoryStorage(data, `${path}${folder}`),
    getItem: async <T>(
      key: string,
      parse?: (item: string | null) => T | null,
    ) => {
      const value = data.get(absolute(key)) ?? null
      return parse ? parse(value) : value === null ? null : JSON.parse(value)
    },
    setItem: async <T>(
      key: string,
      value: T,
      stringify: (item: T) => string = JSON.stringify,
    ) => {
      data.set(absolute(key), stringify(value))
    },
    removeItem: async (key: string) => {
      data.delete(absolute(key))
    },
    getAllKeys: async () =>
      [...data.keys()]
        .filter((key) => key.startsWith(path))
        .map((key) => key.slice(path.length)),
    multiGet: async (keys: ReadonlyArray<string>) =>
      Promise.all(
        keys.map(
          async (key): Promise<[string, unknown]> => [
            key,
            await storage.getItem(key),
          ],
        ),
      ),
    multiSet: async (tuples: ReadonlyArray<[string, unknown]>) => {
      await Promise.all(
        tuples.map(([key, value]) => storage.setItem(key, value)),
      )
    },
    multiRemove: async (keys: ReadonlyArray<string>) => {
      await Promise.all(keys.map((key) => storage.removeItem(key)))
    },
    removeFolder: async (folder: App.StorageFolderName) => {
      const prefix = `${path}${folder}`
      for (const key of data.keys())
        if (key.startsWith(prefix)) data.delete(key)
    },
    clear: async () => {
      for (const key of data.keys()) if (key.startsWith(path)) data.delete(key)
    },
  }
  return storage as unknown as App.Storage
}
