import {Balance, Portfolio} from '@yoroi/types'

import {addressToHex} from '@yoroi-classic/cml-mobile-bridge'

import {ModernUtxo} from '../utxo/models'

export type CmlAssetQuantity = {
  policyIdHex: string
  assetNameHex: string
  quantity: string
}

export type CmlPaymentInput = {
  transactionHashHex: string
  index: string
  address: string
  addressHex: string
  isBootstrap: boolean
  lovelace: string
  assets: CmlAssetQuantity[]
}

/** Convert wallet amounts to the lossless decimal-string representation used by the CML bridge. */
export const cmlAssetsFromAmounts = (
  amounts: Balance.Amounts,
  primaryTokenId: Portfolio.Token.Id,
): CmlAssetQuantity[] =>
  Object.entries(amounts)
    .filter(
      ([tokenId, quantity]) =>
        tokenId !== primaryTokenId && BigInt(quantity) !== 0n,
    )
    .map(([tokenId, quantity]) => {
      const subject = tokenId.replace('.', '')
      if (!/^[0-9a-fA-F]{56,120}$/.test(subject)) {
        throw new Error(`Invalid Cardano asset identifier: ${tokenId}`)
      }
      return {
        // Keep this low-level builder utility independent of @yoroi/api, which
        // imports @yoroi/tx and would create a runtime cycle here.
        policyIdHex: subject.slice(0, 56),
        assetNameHex: subject.slice(56),
        quantity: String(quantity),
      }
    })

/** Convert a spendable UTxO into the CML builder DTO without numeric coercion. */
export const cmlPaymentInputFromUtxo = (
  utxo: ModernUtxo,
  primaryTokenId: Portfolio.Token.Id,
): CmlPaymentInput => {
  if (!Number.isSafeInteger(utxo.txIndex) || utxo.txIndex < 0) {
    throw new Error(`Invalid UTxO output index: ${utxo.txIndex}`)
  }
  const addressHex = addressToHex(utxo.receiver)
  const headerByte = Number.parseInt(addressHex.slice(0, 2), 16)
  if (!Number.isFinite(headerByte)) {
    throw new Error(`Invalid UTxO address: ${utxo.receiver}`)
  }

  return {
    transactionHashHex: utxo.txHash,
    index: String(utxo.txIndex),
    address: utxo.receiver,
    addressHex,
    isBootstrap: Math.floor(headerByte / 16) === 8,
    lovelace: String(utxo.balance[primaryTokenId] ?? '0'),
    assets: cmlAssetsFromAmounts(utxo.balance, primaryTokenId),
  }
}
