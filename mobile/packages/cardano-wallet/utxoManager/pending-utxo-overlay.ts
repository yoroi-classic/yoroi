import {RawUtxo} from '@yoroi/api'
import {CurrentStateUtxo, PendingUtxoOverlay} from '@yoroi/tx'
import {Branded} from '@yoroi/types'

import {
  transactionIdHex,
  transactionReviewInfoJson,
} from '@yoroi-classic/cml-mobile-bridge'
import {Buffer} from 'buffer'

type TransactionInput = {transactionIdHex: string; index: string}
type TransactionOutput = {
  address: string | null
  lovelace: string
  assets: Array<{
    policyIdHex: string
    assetNameHex: string
    quantity: string
  }>
  datum:
    | {kind: 'hash'; hashHex: string}
    | {kind: 'inline'; cborHex: string}
    | null
  scriptRef: {hashHex: string} | null
}

type TransactionReviewInfo = {
  isValid: boolean
  body: {
    ttl: string | null
    inputs: TransactionInput[]
    outputs: TransactionOutput[]
    collateralInputs?: TransactionInput[] | null
    collateralReturn?: TransactionOutput | null
  }
}

/** Builds a conservative pending projection from the submitted CML transaction. */
export const createPendingUtxoOverlayFromCbor = ({
  signedTxBase64,
  walletUtxos,
  ownedAddresses,
}: {
  signedTxBase64: string
  walletUtxos: ReadonlyArray<RawUtxo>
  ownedAddresses: ReadonlySet<string>
}): PendingUtxoOverlay | undefined => {
  const transactionHex = Buffer.from(signedTxBase64, 'base64').toString('hex')
  const reviewInfo = JSON.parse(
    transactionReviewInfoJson(transactionHex),
  ) as TransactionReviewInfo
  const txHash = Branded.asTransactionHash(
    transactionIdHex(transactionHex).toLowerCase(),
  )
  const utxosById = new Set(
    walletUtxos.map((utxo) => utxo.utxo_id.toLowerCase()),
  )
  const inputs = reviewInfo.isValid
    ? reviewInfo.body.inputs
    : (reviewInfo.body.collateralInputs ?? [])
  const spentUtxoIds = inputs.flatMap((input) => {
    const outputIndex = Number(input.index)
    if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) {
      throw new Error('Invalid transaction input index')
    }
    const utxoId = `${input.transactionIdHex.toLowerCase()}:${outputIndex}`
    return utxosById.has(utxoId) ? [Branded.asUtxoId(utxoId)] : []
  })
  const indexedOutputs = reviewInfo.isValid
    ? reviewInfo.body.outputs.map((output, index) => [output, index] as const)
    : reviewInfo.body.collateralReturn
      ? [
          [
            reviewInfo.body.collateralReturn,
            reviewInfo.body.outputs.length,
          ] as const,
        ]
      : []
  const createdUtxos = indexedOutputs.flatMap(([output, outputIndex]) => {
    if (output.address === null || !ownedAddresses.has(output.address))
      return []
    if (!/^(0|[1-9][0-9]*)$/.test(output.lovelace)) {
      throw new Error('Invalid transaction output lovelace')
    }
    const assets = output.assets.map((asset) => {
      const policyId = asset.policyIdHex.toLowerCase()
      const name = asset.assetNameHex.toLowerCase()
      if (
        !/^[0-9a-f]{56}$/.test(policyId) ||
        !/^(?:[0-9a-f]{2}){0,32}$/.test(name)
      ) {
        throw new Error('Invalid transaction output asset identifier')
      }
      if (!/^(0|[1-9][0-9]*)$/.test(asset.quantity)) {
        throw new Error('Invalid transaction output asset quantity')
      }
      return {
        assetId: Branded.asTokenId(`${policyId}.${name}`),
        policyId: Branded.asPolicyId(policyId),
        name: Branded.asAssetName(name),
        amount: Branded.asBalanceQuantity(asset.quantity),
      }
    })
    const utxo: CurrentStateUtxo = {
      utxoId: Branded.asUtxoId(`${txHash}:${outputIndex}`),
      txHash,
      txIndex: outputIndex,
      receiver: Branded.asAddress(output.address),
      amount: Branded.asBalanceQuantity(output.lovelace),
      assets,
      ...(output.datum?.kind === 'hash'
        ? {datumHash: output.datum.hashHex}
        : output.datum?.kind === 'inline'
          ? {inlineDatum: output.datum.cborHex}
          : {}),
      ...(output.scriptRef === null
        ? {}
        : {referenceScriptHash: output.scriptRef.hashHex}),
    }
    return [utxo]
  })

  if (
    reviewInfo.body.ttl != null &&
    !/^(0|[1-9][0-9]*)$/.test(reviewInfo.body.ttl)
  ) {
    throw new Error('Invalid transaction TTL slot')
  }

  // Without a locally tracked input this transaction cannot safely be
  // reconciled against an authoritative account snapshot. Avoid projecting
  // owned outputs indefinitely for an unrelated or stale transaction.
  if (spentUtxoIds.length === 0) return undefined
  return {
    txHash,
    ...(typeof reviewInfo.body.ttl === 'string'
      ? {ttlSlot: reviewInfo.body.ttl}
      : {}),
    spentUtxoIds,
    createdUtxos,
  }
}
