import {RawUtxo} from '@yoroi/api'
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
}: {
  storage: App.Storage
  source: CurrentStateWalletSource
  pendingStore: PersistentPendingUtxoOverlayStore
  stakeAddress: StakingAddress
}) => {
  const managerStorage = makeUtxoManagerStorage(storage)
  const storedUtxos = await storage.getItem<CurrentStateUtxo[]>(
    currentStateCacheKey,
    (data) => {
      const parsed = parseSafe(data)
      return Array.isArray(parsed) ? (parsed as CurrentStateUtxo[]) : null
    },
  )
  let authoritativeUtxos: CurrentStateUtxo[] = storedUtxos ?? []

  const getCachedUtxos = async () => {
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

  return {
    kind: 'current-state' as const,
    clear: async () => {
      await storage.removeItem(currentStateCacheKey)
      await pendingStore.clearPendingUtxoOverlaysForFullResync()
      await managerStorage.collateral.clear()
      authoritativeUtxos = []
    },
    initialUtxos,
    getCachedUtxos,
    getChainTip: () => source.getChainTip(),
    savePendingOverlay: (overlay: PendingUtxoOverlay) =>
      pendingStore.savePendingUtxoOverlay(stakeAddress, overlay),
    removePendingOverlay: (txHash: PendingUtxoOverlay['txHash']) =>
      pendingStore.removePendingUtxoOverlay(stakeAddress, txHash),
    sync: async (_addresses: Array<string>) => {
      const nextUtxos = await source.getAccountUtxos(stakeAddress)
      await storage.setItem(currentStateCacheKey, nextUtxos)
      authoritativeUtxos = [...nextUtxos]
      const currentIds = new Set(nextUtxos.map((utxo) => utxo.utxoId))
      const pending =
        await pendingStore.getPendingUtxoOverlaysInSubmissionOrder(stakeAddress)
      for (const overlay of pending) {
        const observed =
          overlay.spentUtxoIds.length > 0 &&
          overlay.spentUtxoIds.every((utxoId) => !currentIds.has(utxoId))
        if (observed) {
          await pendingStore.removePendingUtxoOverlay(
            stakeAddress,
            overlay.txHash,
          )
        }
      }
    },
    initialCollateralId,
    getCollateralId,
    setCollateralId: (utxoId: RawUtxo['utxo_id']) =>
      managerStorage.collateral.save(utxoId),
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
