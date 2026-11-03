import {CardanoWalletBackendNetworkMismatchError, RawUtxo} from '@yoroi/api'
import {isString, parseSafe} from '@yoroi/common'
import {
  CurrentStateUtxo,
  CurrentStateWalletSource,
  PendingUtxoOverlay,
  PersistentPendingUtxoOverlayStore,
  Utxo,
  UtxoAtSafePoint,
  UtxoDiffToBestBlock,
  UtxoStorage,
  applyPendingUtxoOverlays,
  init as initUtxo,
} from '@yoroi/tx'
import {
  App,
  Balance,
  Branded,
  PolicyId,
  Portfolio,
  StakingAddress,
} from '@yoroi/types'

import {parseInt} from 'lodash'

export const makeUtxoManager = async ({
  storage,
  apiUrl,
}: {
  storage: App.Storage
  apiUrl: string
}) => {
  const managerStorage = makeUtxoManagerStorage(storage)
  const serviceStorage = makeUtxoStorage(storage.join('utxos/'))
  const service = initUtxo(serviceStorage, `${apiUrl}/`)

  let addrCounter = await managerStorage.addrCounter.read()

  const getCachedUtxos = () =>
    service.getAvailableUtxos().then((utxos) => utxos.map(serializer))
  const initialUtxos = await getCachedUtxos()

  const getCollateralId = async (): Promise<string> => {
    const collateralId = await managerStorage.collateral.read()
    return collateralId ?? ''
  }

  const initialCollateralId = await getCollateralId()

  // utxo state is related to the addresses used, if it changes a reset is needed
  const sync = (addresses: Array<string>) => {
    if (addresses.length === addrCounter)
      return service.syncUtxoState(
        addresses.map((addr) => Branded.asAddress(addr)),
      )

    return serviceStorage
      .clearUtxoState()
      .then(() =>
        service.syncUtxoState(addresses.map((addr) => Branded.asAddress(addr))),
      )
      .then(() => managerStorage.addrCounter.save(addresses.length))
      .then(() => {
        addrCounter = addresses.length
      })
  }

  return {
    kind: 'legacy' as const,
    clear: async () => {
      await serviceStorage.clearUtxoState()
      await managerStorage.addrCounter.clear()
      await managerStorage.collateral.clear()
    },
    initialUtxos,
    getCachedUtxos,
    sync,

    initialCollateralId,
    getCollateralId,
    setCollateralId: (utxoId: RawUtxo['utxo_id']) =>
      managerStorage.collateral.save(utxoId),
  } as const
}

const currentStateCacheKey = 'current-state-cache'

/** Shelley UTxOs come from an authoritative backend snapshot, never legacy diffs. */
export const makeCurrentStateUtxoManager = async ({
  storage,
  source,
  pendingStore,
  stakeAddress,
  ownedAddresses: initialOwnedAddresses,
  fallbackManager,
}: {
  storage: App.Storage
  source: CurrentStateWalletSource
  pendingStore: PersistentPendingUtxoOverlayStore
  stakeAddress: StakingAddress
  ownedAddresses?: ReadonlyArray<string>
  fallbackManager?: Awaited<ReturnType<typeof makeUtxoManager>>
}) => {
  const managerStorage = makeUtxoManagerStorage(storage)
  const storedUtxos = await storage.getItem<CurrentStateUtxo[]>(
    currentStateCacheKey,
    (data) => {
      const parsed = parseSafe(data)
      return Array.isArray(parsed) ? (parsed as CurrentStateUtxo[]) : null
    },
  )
  let ownedAddressSet =
    initialOwnedAddresses === undefined
      ? undefined
      : new Set(initialOwnedAddresses)
  let authoritativeUtxos: CurrentStateUtxo[] = (storedUtxos ?? []).filter(
    (utxo) =>
      ownedAddressSet === undefined || ownedAddressSet.has(utxo.receiver),
  )
  let useLegacyFallback = false

  const getCachedUtxos = async () => {
    if (useLegacyFallback && fallbackManager) {
      return fallbackManager.getCachedUtxos()
    }
    const pending =
      await pendingStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress)
    return applyPendingUtxoOverlays(authoritativeUtxos, pending).map(
      currentStateSerializer,
    )
  }
  const getCollateralId = async (): Promise<string> =>
    (await managerStorage.collateral.read()) ?? ''
  const initialCollateralId = await getCollateralId()
  const initialUtxos = await getCachedUtxos()
  let syncQueue = Promise.resolve()
  const syncCurrentState = async (addresses: Array<string>) => {
    if (addresses.length > 0) ownedAddressSet = new Set(addresses)
    const nextUtxos = await source.getAccountUtxos(stakeAddress)
    const ownedUtxos = nextUtxos.filter(
      (utxo) =>
        ownedAddressSet === undefined || ownedAddressSet.has(utxo.receiver),
    )
    const currentIds = new Set(ownedUtxos.map((utxo) => utxo.utxoId))
    const pending =
      await pendingStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress)
    const earlierPendingOutputIds = new Set<string>()
    const overlaysWithUnspentInputs = pending.filter((overlay) => {
      const hasTrackedInput = overlay.spentUtxoIds.some(
        (utxoId) =>
          currentIds.has(utxoId) || earlierPendingOutputIds.has(utxoId),
      )
      for (const createdUtxo of overlay.createdUtxos) {
        earlierPendingOutputIds.add(createdUtxo.utxoId)
      }
      return overlay.ttlSlot !== undefined && hasTrackedInput
    })
    const currentSlot =
      overlaysWithUnspentInputs.length > 0
        ? (await source.getChainTip()).bestBlock.slot
        : undefined
    await storage.setItem(currentStateCacheKey, ownedUtxos)
    authoritativeUtxos = [...ownedUtxos]
    const retainedPendingOutputIds = new Set<string>()
    const removedPendingOutputIds = new Set<string>()
    for (const overlay of pending) {
      const spendsRetainedPendingOutput = overlay.spentUtxoIds.some((utxoId) =>
        retainedPendingOutputIds.has(utxoId),
      )
      const spendsRemovedPendingOutput = overlay.spentUtxoIds.some((utxoId) =>
        removedPendingOutputIds.has(utxoId),
      )
      const hasUnspentInput =
        spendsRetainedPendingOutput ||
        overlay.spentUtxoIds.some((utxoId) => currentIds.has(utxoId))
      const observed =
        !spendsRetainedPendingOutput &&
        !spendsRemovedPendingOutput &&
        overlay.spentUtxoIds.length > 0 &&
        overlay.spentUtxoIds.every((utxoId) => !currentIds.has(utxoId))
      const expiredWithInputsRemaining =
        overlay.ttlSlot !== undefined &&
        overlay.spentUtxoIds.length > 0 &&
        hasUnspentInput &&
        currentSlot !== undefined &&
        currentSlot !== null &&
        BigInt(currentSlot) > BigInt(overlay.ttlSlot)
      if (
        spendsRemovedPendingOutput ||
        observed ||
        expiredWithInputsRemaining
      ) {
        for (const createdUtxo of overlay.createdUtxos) {
          removedPendingOutputIds.add(createdUtxo.utxoId)
        }
        await pendingStore.removePendingUtxoOverlay(
          stakeAddress,
          overlay.txHash,
        )
      } else {
        for (const createdUtxo of overlay.createdUtxos) {
          retainedPendingOutputIds.add(createdUtxo.utxoId)
        }
      }
    }
  }

  return {
    get kind() {
      return useLegacyFallback
        ? ('legacy' as const)
        : ('current-state' as const)
    },
    clear: async () => {
      await storage.removeItem(currentStateCacheKey)
      await pendingStore.clearPendingUtxoOverlaysForFullResync()
      await managerStorage.collateral.clear()
      authoritativeUtxos = []
      if (useLegacyFallback && fallbackManager) await fallbackManager.clear()
    },
    initialUtxos,
    getCachedUtxos,
    getChainTip: () => source.getChainTip(),
    savePendingOverlay: (overlay: PendingUtxoOverlay) =>
      pendingStore.savePendingUtxoOverlay(stakeAddress, overlay),
    removePendingOverlay: (txHash: PendingUtxoOverlay['txHash']) =>
      pendingStore.removePendingUtxoOverlay(stakeAddress, txHash),
    sync: async (addresses: Array<string>) => {
      const sync = syncQueue.then(async () => {
        if (useLegacyFallback && fallbackManager) {
          await fallbackManager.sync(addresses)
          return
        }
        try {
          await syncCurrentState(addresses)
        } catch (error) {
          if (
            !(error instanceof CardanoWalletBackendNetworkMismatchError) ||
            !fallbackManager
          ) {
            throw error
          }
          useLegacyFallback = true
          await fallbackManager.sync(addresses)
        }
      })
      syncQueue = sync.catch(() => undefined)
      await sync
    },
    initialCollateralId,
    getCollateralId: () =>
      useLegacyFallback && fallbackManager
        ? fallbackManager.getCollateralId()
        : getCollateralId(),
    setCollateralId: (utxoId: RawUtxo['utxo_id']) =>
      useLegacyFallback && fallbackManager
        ? fallbackManager.setCollateralId(utxoId)
        : managerStorage.collateral.save(utxoId),
  } as const
}

const currentStateSerializer = (utxo: CurrentStateUtxo): RawUtxo => ({
  utxo_id: utxo.utxoId,
  tx_hash: utxo.txHash,
  tx_index: utxo.txIndex,
  receiver: utxo.receiver,
  amount: utxo.amount,
  assets: utxo.assets.map((asset) => ({
    amount: asset.amount,
    tokenId: asset.assetId as Portfolio.Token.Id,
    policyId: asset.policyId,
    name: asset.name,
  })),
  ...(utxo.datumHash === undefined ? {} : {datumHash: utxo.datumHash}),
  ...(utxo.inlineDatum === undefined ? {} : {inlineDatum: utxo.inlineDatum}),
  ...(utxo.referenceScriptHash === undefined
    ? {}
    : {referenceScriptHash: utxo.referenceScriptHash}),
})

export const makeUtxoManagerStorage = (storage: App.Storage) => {
  const addrCounterKey = 'addrCounter'
  const collateralKey = 'collateral'

  return {
    addrCounter: {
      save: (count: number) => storage.setItem(addrCounterKey, count),
      clear: () => storage.removeItem(addrCounterKey),
      read: () =>
        storage.getItem(addrCounterKey, (count) =>
          count != null ? parseInt(count) : 0,
        ),
    },
    collateral: {
      save: (utxoId: string) => storage.setItem(collateralKey, utxoId),
      clear: () => storage.removeItem(collateralKey),
      read: () =>
        storage.getItem<string>(collateralKey, (utxoId) => {
          const parsed = parseSafe(utxoId)
          return isString(parsed) ? parsed : ''
        }),
    },
  } as const
}

const serializer = (utxo: Utxo): RawUtxo => {
  const rawUtxo: RawUtxo = {
    utxo_id: utxo.utxoId,
    tx_hash: utxo.txHash,
    tx_index: utxo.txIndex,
    amount: utxo.amount.toString() as Balance.Quantity,
    receiver: utxo.receiver,
    // Convert Asset[] (with assetId) to RemoteAsset[] (with tokenId)
    // assetId from backend is already the full token ID in format policyId.assetNameHex
    // RemoteAsset expects amount: BalanceQuantity (string), not Balance.Amount
    assets: utxo.assets.map((asset) => ({
      amount: asset.amount.toString() as Balance.Quantity,
      tokenId: asset.assetId as Portfolio.Token.Id,
      policyId: asset.policyId as PolicyId,
      name: asset.name,
    })),
  }
  return rawUtxo
}

export type UtxoManager =
  | Awaited<ReturnType<typeof makeUtxoManager>>
  | Awaited<ReturnType<typeof makeCurrentStateUtxoManager>>

const diffPath = 'diff'
const safePointPath = 'safe-point'

export const makeUtxoStorage = (storage: App.Storage) => {
  const getUtxoDiffToBestBlock = () =>
    storage.getItem(diffPath, parseDiff).then((diff) => diff ?? [])
  const setUtxoDiffToBestBlock = (utxoDiffToBestBlock: UtxoDiffToBestBlock[]) =>
    storage.setItem(diffPath, utxoDiffToBestBlock)

  const getUtxoAtSafePoint = async (): Promise<UtxoAtSafePoint | undefined> => {
    const safePoint = await storage.getItem(safePointPath, parseSafePoint)
    if (!safePoint) return undefined
    return safePoint
  }
  const setUtxoAtSafePoint = (utxoAtSafePoint: UtxoAtSafePoint) =>
    storage.setItem(safePointPath, utxoAtSafePoint)

  const utxoStorage: UtxoStorage = {
    getUtxoAtSafePoint,
    replaceUtxoAtSafePoint: (utxos: Utxo[], lastSafeBlockHash: string) =>
      setUtxoAtSafePoint({
        lastSafeBlockHash: Branded.asBlockHash(lastSafeBlockHash),
        utxos,
      }),

    getUtxoDiffToBestBlock,
    appendUtxoDiffToBestBlock: async (diff: UtxoDiffToBestBlock) => {
      const currentDiffs = await getUtxoDiffToBestBlock()
      if (
        currentDiffs.find((d) => d.lastBestBlockHash === diff.lastBestBlockHash)
      )
        return
      return setUtxoDiffToBestBlock([...currentDiffs, diff])
    },
    removeDiffWithBestBlock: async (blockHash: string) => {
      const currentDiffs = await getUtxoDiffToBestBlock()
      return setUtxoDiffToBestBlock(
        currentDiffs.filter((d) => d.lastBestBlockHash !== blockHash),
      )
    },

    clearUtxoState: () =>
      Promise.all([
        storage.removeItem(safePointPath),
        storage.removeItem(diffPath),
      ]).then(() => undefined),
  }

  return utxoStorage
}

const parseSafePoint = (data: unknown) => {
  const parsed = parseSafe(data)
  return isSafePoint(parsed) ? parsed : undefined
}
const isSafePoint = (data: unknown): data is UtxoAtSafePoint => {
  const candidate = data as UtxoAtSafePoint
  return (
    !!candidate &&
    !!candidate.lastSafeBlockHash &&
    Array.isArray(candidate.utxos)
  )
}

const parseDiff = (data: unknown) => {
  const parsed = parseSafe(data)
  return isDiff(parsed) ? parsed : undefined
}
const isDiff = (data: unknown): data is UtxoDiffToBestBlock[] => {
  const candidate = data as UtxoDiffToBestBlock[]
  return Array.isArray(candidate)
}
