import {App, Branded, StakingAddress, TransactionHash} from '@yoroi/types'

import {z} from 'zod'

import {
  PendingUtxoOverlay,
  PendingUtxoOverlayStore,
} from './pending-utxo-overlay'

const STORAGE_FOLDER = 'pending-utxo-overlays/'
const STORAGE_KEY = 'state.v1'
const STORAGE_VERSION = 1 as const

// App.Storage does not expose a stable storage-root identifier. Serialize the
// rare pending-overlay mutations process-wide so two store instances backed by
// the same account root cannot lose each other's read-modify-write updates.
let pendingOverlayWriteQueue: Promise<void> = Promise.resolve()

const hex = z
  .string()
  .regex(/^[0-9a-fA-F]*$/)
  .transform((value) => value.toLowerCase())
const transactionHash = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/)
  .transform((value) => Branded.asTransactionHash(value.toLowerCase()))
const outputIndex = z.number().int().nonnegative()
const quantity = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform((value) => Branded.asBalanceQuantity(value))
const stakingAddress = z.string().regex(/^stake(_test)?1[0-9a-z]+$/)
const paymentAddress = z
  .string()
  .regex(/^addr(_test)?1[0-9a-z]+$/)
  .transform((value) => Branded.asAddress(value))
const utxoId = z
  .string()
  .regex(/^[0-9a-fA-F]{64}:[0-9]+$/)
  .transform((value) => Branded.asUtxoId(value.toLowerCase()))

const assetSchema = z
  .object({
    assetId: z
      .string()
      .regex(/^[0-9a-fA-F]{56}\.[0-9a-fA-F]{0,64}$/)
      .transform((value) => Branded.asTokenId(value.toLowerCase())),
    policyId: z
      .string()
      .regex(/^[0-9a-fA-F]{56}$/)
      .transform((value) => Branded.asPolicyId(value.toLowerCase())),
    name: hex
      .refine((value) => value.length <= 64 && value.length % 2 === 0)
      .transform((value) => Branded.asAssetName(value)),
    amount: quantity,
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.assetId !== `${asset.policyId}.${asset.name}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Asset id does not match policy id and asset name',
      })
    }
  })

const currentStateUtxoSchema = z
  .object({
    utxoId,
    txHash: transactionHash,
    txIndex: outputIndex,
    receiver: paymentAddress,
    amount: quantity,
    assets: z.array(assetSchema),
    datumHash: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .transform((value) => value.toLowerCase())
      .optional(),
    inlineDatum: hex.refine((value) => value.length % 2 === 0).optional(),
    referenceScriptHash: z
      .string()
      .regex(/^[0-9a-fA-F]{56}$/)
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict()
  .superRefine((utxo, context) => {
    if (utxo.utxoId !== `${utxo.txHash}:${utxo.txIndex}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'UTxO id does not match transaction hash and output index',
      })
    }

    const assetIds = utxo.assets.map((asset) => asset.assetId)
    if (new Set(assetIds).size !== assetIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate asset in pending UTxO',
      })
    }
  })

const pendingOverlaySchema = z
  .object({
    txHash: transactionHash,
    spentUtxoIds: z.array(utxoId),
    createdUtxos: z.array(currentStateUtxoSchema),
  })
  .strict()
  .superRefine((overlay, context) => {
    if (new Set(overlay.spentUtxoIds).size !== overlay.spentUtxoIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate spent UTxO in pending overlay',
      })
    }

    const createdIds = overlay.createdUtxos.map((utxo) => utxo.utxoId)
    if (new Set(createdIds).size !== createdIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate created UTxO in pending overlay',
      })
    }

    if (overlay.createdUtxos.some((utxo) => utxo.txHash !== overlay.txHash)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Created UTxO does not belong to pending transaction',
      })
    }
  })

const stateSchema = z
  .object({
    version: z.literal(STORAGE_VERSION),
    overlaysByStakeAddress: z.record(
      stakingAddress,
      z.array(pendingOverlaySchema),
    ),
  })
  .strict()
  .superRefine((state, context) => {
    for (const [stakeAddress, overlays] of Object.entries(
      state.overlaysByStakeAddress,
    )) {
      const expectedPaymentPrefix = stakeAddress.startsWith('stake_test1')
        ? 'addr_test1'
        : 'addr1'
      if (
        overlays.some((overlay) =>
          overlay.createdUtxos.some(
            (utxo) => !utxo.receiver.startsWith(expectedPaymentPrefix),
          ),
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pending UTxO network does not match staking address',
        })
      }

      const hashes = overlays.map((overlay) => overlay.txHash)
      if (new Set(hashes).size !== hashes.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate pending transaction hash',
        })
      }
    }
  })

type PersistedState = {
  version: typeof STORAGE_VERSION
  overlaysByStakeAddress: Record<string, PendingUtxoOverlay[]>
}

export type PersistentPendingUtxoOverlayStore = PendingUtxoOverlayStore & {
  savePendingUtxoOverlay(
    stakeAddress: StakingAddress,
    overlay: PendingUtxoOverlay,
  ): Promise<void>
  replacePendingUtxoOverlays(
    stakeAddress: StakingAddress,
    overlays: ReadonlyArray<PendingUtxoOverlay>,
  ): Promise<void>
  removePendingUtxoOverlay(
    stakeAddress: StakingAddress,
    txHash: TransactionHash,
  ): Promise<void>
  clearPendingUtxoOverlays(stakeAddress: StakingAddress): Promise<void>
  /**
   * Clears every overlay below this account storage root before a full resync.
   *
   * Wallet removal needs no separate store call: the wallet lifecycle removes
   * the parent wallet storage folder recursively, which owns this account data.
   */
  clearPendingUtxoOverlaysForFullResync(): Promise<void>
}

const emptyState = (): PersistedState => ({
  version: STORAGE_VERSION,
  overlaysByStakeAddress: {},
})

const parseState = (value: unknown): PersistedState => {
  if (value === null) return emptyState()

  const parsed = stateSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('Invalid persisted pending UTxO overlay state')
  }
  return parsed.data
}

const parseStakeAddress = (value: StakingAddress): string => {
  const parsed = stakingAddress.safeParse(value)
  if (!parsed.success) throw new Error('Invalid pending UTxO staking address')
  return parsed.data
}

const parseOverlays = (
  stakeAddressValue: StakingAddress,
  overlays: ReadonlyArray<PendingUtxoOverlay>,
): PendingUtxoOverlay[] => {
  const stakeAddressKey = parseStakeAddress(stakeAddressValue)
  const parsed = stateSchema.safeParse({
    version: STORAGE_VERSION,
    overlaysByStakeAddress: {[stakeAddressKey]: overlays},
  })
  if (!parsed.success) throw new Error('Invalid pending UTxO overlay')
  return parsed.data.overlaysByStakeAddress[stakeAddressKey] ?? []
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const canonicalOverlayForComparison = (overlay: PendingUtxoOverlay) => ({
  txHash: overlay.txHash,
  spentUtxoIds: [...overlay.spentUtxoIds].sort(compareText),
  createdUtxos: overlay.createdUtxos
    .map((utxo) => ({
      ...utxo,
      assets: [...utxo.assets].sort((left, right) =>
        compareText(left.assetId, right.assetId),
      ),
    }))
    .sort((left, right) => compareText(left.utxoId, right.utxoId)),
})

const sameOverlay = (
  left: PendingUtxoOverlay,
  right: PendingUtxoOverlay,
): boolean =>
  JSON.stringify(canonicalOverlayForComparison(left)) ===
  JSON.stringify(canonicalOverlayForComparison(right))

/**
 * Stores pending overlays below a wallet/account-scoped storage root.
 *
 * The single versioned document preserves submission order. Mutations are
 * serialized so concurrent submission and reconciliation cannot overwrite one
 * another. Invalid or unsupported persisted data fails closed rather than
 * exposing inputs that may already have been submitted for spending.
 */
export const createPersistentPendingUtxoOverlayStore = (
  accountStorage: App.Storage,
): PersistentPendingUtxoOverlayStore => {
  const storage = accountStorage.join(STORAGE_FOLDER)

  const readState = async (): Promise<PersistedState> =>
    parseState(await storage.getItem(STORAGE_KEY))

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pendingOverlayWriteQueue.then(operation)
    pendingOverlayWriteQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const saveState = (state: PersistedState) =>
    Promise.resolve(storage.setItem(STORAGE_KEY, state))

  return {
    async getPendingUtxoOverlaysInSubmissionOrder(stakeAddressValue) {
      await pendingOverlayWriteQueue
      const stakeAddressKey = parseStakeAddress(stakeAddressValue)
      const state = await readState()
      return state.overlaysByStakeAddress[stakeAddressKey] ?? []
    },

    savePendingUtxoOverlay(stakeAddressValue, overlay) {
      return enqueue(async () => {
        const stakeAddressKey = parseStakeAddress(stakeAddressValue)
        const [validatedOverlay] = parseOverlays(stakeAddressValue, [overlay])
        const state = await readState()
        const overlays = [
          ...(state.overlaysByStakeAddress[stakeAddressKey] ?? []),
        ]
        const existingIndex = overlays.findIndex(
          (candidate) => candidate.txHash === validatedOverlay!.txHash,
        )

        if (existingIndex === -1) overlays.push(validatedOverlay!)
        else if (!sameOverlay(overlays[existingIndex]!, validatedOverlay!)) {
          throw new Error('Conflicting pending UTxO overlay for transaction')
        }

        await saveState({
          ...state,
          overlaysByStakeAddress: {
            ...state.overlaysByStakeAddress,
            [stakeAddressKey]: overlays,
          },
        })
      })
    },

    replacePendingUtxoOverlays(stakeAddressValue, overlays) {
      return enqueue(async () => {
        const stakeAddressKey = parseStakeAddress(stakeAddressValue)
        const validated = parseOverlays(stakeAddressValue, overlays)
        const state = await readState()
        await saveState({
          ...state,
          overlaysByStakeAddress: {
            ...state.overlaysByStakeAddress,
            [stakeAddressKey]: validated,
          },
        })
      })
    },

    removePendingUtxoOverlay(stakeAddressValue, txHashValue) {
      return enqueue(async () => {
        const stakeAddressKey = parseStakeAddress(stakeAddressValue)
        const parsedHash = transactionHash.safeParse(txHashValue)
        if (!parsedHash.success)
          throw new Error('Invalid pending transaction hash')
        const state = await readState()
        const overlays = (
          state.overlaysByStakeAddress[stakeAddressKey] ?? []
        ).filter((overlay) => overlay.txHash !== parsedHash.data)
        await saveState({
          ...state,
          overlaysByStakeAddress: {
            ...state.overlaysByStakeAddress,
            [stakeAddressKey]: overlays,
          },
        })
      })
    },

    clearPendingUtxoOverlays(stakeAddressValue) {
      return enqueue(async () => {
        const stakeAddressKey = parseStakeAddress(stakeAddressValue)
        const state = await readState()
        const overlaysByStakeAddress = {...state.overlaysByStakeAddress}
        delete overlaysByStakeAddress[stakeAddressKey]
        await saveState({...state, overlaysByStakeAddress})
      })
    },

    clearPendingUtxoOverlaysForFullResync() {
      return enqueue(() => Promise.resolve(storage.removeItem(STORAGE_KEY)))
    },
  }
}
