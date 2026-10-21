import {toAssetNameHex, toPolicyId} from '@yoroi/api'
import type {ModernUtxo} from '@yoroi/tx'
import type {Portfolio} from '@yoroi/types'

import {transactionUnspentOutputHex} from '@yoroi-classic/cml-mobile-bridge'

/** Serialize a wallet UTxO as CIP-30 CBOR through CML. */
export function serializeModernUtxoCml(
  utxo: Pick<ModernUtxo, 'receiver' | 'txHash' | 'txIndex' | 'balance'>,
  primaryTokenId: Portfolio.Token.Id,
): string {
  if (!Number.isSafeInteger(utxo.txIndex) || utxo.txIndex < 0) {
    throw new Error('Invalid UTxO output index')
  }

  return transactionUnspentOutputHex({
    txHashHex: utxo.txHash,
    index: String(utxo.txIndex),
    address: utxo.receiver,
    lovelace: utxo.balance[primaryTokenId] ?? '0',
    assets: Object.entries(utxo.balance)
      .filter(([tokenId]) => tokenId !== primaryTokenId)
      .map(([tokenId, quantity]) => ({
        policyIdHex: toPolicyId(tokenId),
        assetNameHex: toAssetNameHex(tokenId),
        quantity,
      })),
  })
}
