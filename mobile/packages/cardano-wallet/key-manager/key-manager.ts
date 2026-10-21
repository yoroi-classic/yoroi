import {cardanoConfig} from '@yoroi/blockchains'
import {Wallet} from '@yoroi/types'

import {deriveAccountPublicKeyHex, walletRootKeyHexFromEntropy} from '@yoroi-classic/cml-mobile-bridge'
import {mnemonicToEntropy} from 'bip39'
import {freeze} from 'immer'

export const keyManager =
  (implementation: Wallet.Implementation) =>
  ({
    mnemonic,
    accountVisual = 0,
  }: {
    mnemonic: string
    accountVisual?: number
  }) => {
    const config = cardanoConfig.implementations[implementation]

    const rootKey = walletRootKeyHexFromEntropy(mnemonicToEntropy(mnemonic))
    const accountPubKeyHex = deriveAccountPublicKeyHex({
      masterKeyHex: rootKey,
      purpose: String(config.derivations.base.harden.purpose),
      coinType: String(config.derivations.base.harden.coinType),
      accountIndex: String(accountVisual),
    })

    return freeze({
      rootKey,
      accountPubKeyHex,
    })
  }

/**
 * Derives accountPubKeyHex from root key for any accountVisual
 * This allows deriving multiple accounts from a single root key
 */
export const deriveAccountFromRootKey = (
  rootKeyHex: string,
  accountVisual: number,
  implementation: Wallet.Implementation,
): string => {
  const config = cardanoConfig.implementations[implementation]
  return deriveAccountPublicKeyHex({
    masterKeyHex: rootKeyHex,
    purpose: String(config.derivations.base.harden.purpose),
    coinType: String(config.derivations.base.harden.coinType),
    accountIndex: String(accountVisual),
  })
}
