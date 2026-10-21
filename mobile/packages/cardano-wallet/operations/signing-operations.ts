import {cardanoConfig} from '@yoroi/blockchains'
import type {UnsignedTransaction} from '@yoroi/tx'
import {Wallet} from '@yoroi/types'

import {
  signWalletTransactionHex,
  signWalletTransactionPathsHex,
} from '@yoroi-classic/cml-mobile-bridge'
import {Buffer} from 'buffer'


/**
 * Sign a transaction with a decrypted master key
 */
export const signWalletTransaction = (
  unsignedTx: UnsignedTransaction,
  decryptedMasterKey: string,
  accountVisual: number,
  implementation: Wallet.Implementation,
): Uint8Array => {
  if (!unsignedTx.cbor) {
    throw new Error('UnsignedTransaction must have CBOR to sign')
  }

  const implementationConfig =
    cardanoConfig.implementations[
      implementation as keyof typeof cardanoConfig.implementations
    ]

  let stakingRole: string | undefined
  let stakingIndex: string | undefined
  if (implementationConfig.features.staking) {
    const derivation = implementationConfig.features.staking.derivation
    stakingRole = String(derivation.role)
    stakingIndex = String(derivation.index)
  }

  // Derive staking key requirements from certificates and withdrawals
  let needsStakingKey = false
  if (unsignedTx.certificates.length > 0 || unsignedTx.withdrawals.length > 0) {
    needsStakingKey = true
  }

  // Check for governance-related certificates (vote delegation, etc.)
  for (const certData of unsignedTx.certificates) {
    const certKind = 'kind' in certData ? certData.kind : 'unknown'
    if (
      certKind === 'VoteDelegation' ||
      certKind === 'StakeAndVoteDelegation' ||
      certKind === 'StakeVoteRegistrationAndDelegation' ||
      certKind === 'VoteRegistrationAndDelegation'
    ) {
      needsStakingKey = true
      break
    }
  }

  if (needsStakingKey && (!stakingRole || !stakingIndex)) {
    throw new Error('signWalletTransaction: required staking key but not supported')
  }

  const signedTransactionHex = signWalletTransactionHex({
    transactionHex: unsignedTx.cbor,
    masterKeyHex: decryptedMasterKey,
    purpose: String(implementationConfig.derivations.base.harden.purpose),
    coinType: String(implementationConfig.derivations.base.harden.coinType),
    accountIndex: String(accountVisual),
    ...(needsStakingKey ? {stakingRole, stakingIndex} : {}),
  })

  return new Uint8Array(Buffer.from(signedTransactionHex, 'hex'))
}

/** Sign a transaction with explicitly resolved wallet derivation paths in CML. */
export const signWalletTransactionWithPaths = (
  transactionHex: string,
  masterKeyHex: string,
  signerPaths: number[][],
): Uint8Array => {
  const signedHex = signWalletTransactionPathsHex({
    transactionHex,
    masterKeyHex,
    signerPaths,
  })
  return new Uint8Array(Buffer.from(signedHex, 'hex'))
}
