// UTXO conversion utilities
// Functions for converting between RawUtxo and ModernUtxo
import {primaryTokenId as defaultPrimaryTokenId} from '@yoroi/portfolio'
import {Balance, Branded, Portfolio, TokenId} from '@yoroi/types'

import {transactionUnspentOutputHex} from '@yoroi-classic/cml-mobile-bridge'

import {Addressing} from '../types'
import {ModernUtxo} from '../utxo/models'

// RawUtxo type from wallet types
export type RawUtxo = {
  readonly amount: string
  readonly receiver: string
  readonly tx_hash: string
  readonly tx_index: number
  readonly utxo_id: string
  readonly assets: ReadonlyArray<{
    readonly amount: string
    readonly tokenId: Portfolio.Token.Id
    readonly policyId: string
    readonly name: string
  }>
  readonly datumHash?: string
  readonly inlineDatum?: string
  readonly referenceScriptHash?: string
  readonly referenceScript?: {
    readonly hash: string
    readonly size?: number
    readonly type?: string
    readonly bytes?: string
  }
}

/**
 * Convert RawUtxo to ModernUtxo
 * @param rawUtxo - Raw UTXO from API (can be from wallet types or tx utils)
 * @param addressing - Optional addressing for signing
 * @param derivationPath - Optional derivation path for display
 * @param primaryTokenId - Primary token ID (typically '' for ADA)
 */
export function rawUtxoToModernUtxo(
  rawUtxo: {
    readonly amount: string
    readonly receiver: string
    readonly tx_hash: string
    readonly tx_index: number
    readonly utxo_id: string
    readonly assets: ReadonlyArray<{
      readonly amount: string
      readonly tokenId: Portfolio.Token.Id
      readonly policyId: string
      readonly name: string
    }>
    readonly datumHash?: string
    readonly inlineDatum?: string
    readonly referenceScriptHash?: string
    readonly referenceScript?: {
      readonly hash: string
      readonly size?: number
      readonly type?: string
      readonly bytes?: string
    }
  },
  addressing?: Addressing,
  derivationPath?: string,
  primaryTokenId: string = '',
): ModernUtxo {
  const balance: Balance.Amounts = {}

  // Add primary token (ADA)
  if (BigInt(rawUtxo.amount) > 0n) {
    balance[primaryTokenId as TokenId] = rawUtxo.amount as Balance.Quantity
  }

  // Add other assets
  rawUtxo.assets.forEach((asset) => {
    balance[asset.tokenId as TokenId] = asset.amount as Balance.Quantity
  })

  // Create the ModernUtxo object
  const modernUtxo: ModernUtxo = {
    receiver: Branded.asAddress(rawUtxo.receiver),
    txHash: Branded.asTransactionHash(rawUtxo.tx_hash),
    txIndex: rawUtxo.tx_index,
    balance,
    datumHashHex: rawUtxo.datumHash,
    inlineDatumCborHex: rawUtxo.inlineDatum,
    referenceScript: isReferenceScriptConsistent(rawUtxo)
      ? rawUtxo.referenceScript
      : undefined,
    derivationPath,
    addressing,
    toTransactionUnspentOutputHex,
  }

  // Bind methods to the object
  modernUtxo.toTransactionUnspentOutputHex =
    toTransactionUnspentOutputHex.bind(modernUtxo)

  return modernUtxo
}

const isReferenceScriptConsistent = (utxo: {
  referenceScriptHash?: string
  referenceScript?: {hash: string; size?: number; bytes?: string}
}): boolean => {
  const refScript = utxo.referenceScript
  if (!refScript) return false
  return (
    /^[0-9a-fA-F]{56}$/.test(refScript.hash) &&
    (utxo.referenceScriptHash == null ||
      utxo.referenceScriptHash.toLowerCase() ===
        refScript.hash.toLowerCase()) &&
    (refScript.bytes == null ||
      (/^(?:[0-9a-fA-F]{2})+$/.test(refScript.bytes) &&
        refScript.size === refScript.bytes.length / 2))
  )
}

/**
 * Convert ModernUtxo to TransactionUnspentOutput hex
 */
function toTransactionUnspentOutputHex(this: ModernUtxo): string {
  if (!Number.isSafeInteger(this.txIndex) || this.txIndex < 0) {
    throw new Error('Invalid UTxO output index')
  }
  const primaryAmount = this.balance[defaultPrimaryTokenId] ?? '0'
  const assets = Object.entries(this.balance)
    .filter(([tokenId]) => tokenId !== defaultPrimaryTokenId)
    .map(([tokenId, quantity]) => {
      const subject = tokenId.replace('.', '')
      if (!/^[0-9a-fA-F]{56,120}$/.test(subject)) {
        throw new Error(`Invalid asset identifier: ${tokenId}`)
      }
      return {
        policyIdHex: subject.slice(0, 56),
        assetNameHex: subject.slice(56),
        quantity,
      }
    })

  return transactionUnspentOutputHex({
    txHashHex: this.txHash,
    index: String(this.txIndex),
    address: this.receiver,
    lovelace: primaryAmount,
    assets,
  })
}
