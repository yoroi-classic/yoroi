import type {AccountStateResponse} from '@yoroi/api'
import {cardanoConfig} from '@yoroi/blockchains'
import type {StakingInfo} from '@yoroi/staking'
import {isByronAddress} from '@yoroi/tx'
import {Balance, Branded, Portfolio, Wallet} from '@yoroi/types'

import {
  derivePublicKeyFromAccountPathHex,
  publicKeyHashHexFromRawHex,
} from '@yoroi-classic/cml-mobile-bridge'
import {Buffer} from 'buffer'

import {getStakingKey as getStakingCredentialHash} from '../addressInfo/addressInfo'
import {getDelegationStatus} from '../delegationUtils'
import type {TimestampedCertMeta} from '../transactionManager/transactionManager'
import type {CardanoTypes, YoroiWallet} from '../types'
import {Quantities} from '../utils/utils'

const publicKeyLike = (
  rawPublicKeyHex: string,
  keyHashHex: string,
): CardanoTypes.PublicKey => {
  const bytes = Uint8Array.from(Buffer.from(keyHashHex, 'hex'))
  return {
    toHex: () => rawPublicKeyHex,
    hash: () => ({
      toHex: () => keyHashHex,
      toBytes: () => bytes,
    }),
  } as CardanoTypes.PublicKey
}

/**
 * Get staking key for a wallet
 */
export const getStakingKey = (
  wallet: {
    publicKeyHex: string
    accountVisual: number
    externalAddresses: string[]
    internalAddresses: string[]
  },
  implementation: Wallet.Implementation,
  _chainId: number,
): CardanoTypes.PublicKey => {
  const implementationConfig =
    cardanoConfig.implementations[
      implementation as keyof typeof cardanoConfig.implementations
    ]

  if (!implementationConfig.features.staking) {
    throw new Error('getStakingKey: staking not supported')
  }

  // For read-only wallets, extract staking key hash from addresses
  // since we don't have publicKeyHex to derive it
  if (!wallet.publicKeyHex || wallet.publicKeyHex === '') {
    // Try to extract staking key hash from one of the wallet's addresses
    const addresses = [...wallet.externalAddresses, ...wallet.internalAddresses]

    for (const address of addresses) {
      try {
        // Byron and payment-only/script-stake addresses do not expose a key stake credential.
        if (isByronAddress(address)) {
          continue
        }
        const keyHashHex = getStakingCredentialHash(address)
        if (keyHashHex) return publicKeyLike('', keyHashHex)
      } catch {
        // Continue to next address
        continue
      }
    }

    throw new Error(
      'getStakingKey: Could not extract staking key from addresses for read-only wallet',
    )
  }

  // For full wallets, derive from publicKeyHex
  const derivation = implementationConfig.features.staking.derivation

  const rawPublicKeyHex = derivePublicKeyFromAccountPathHex(
    wallet.publicKeyHex,
    [derivation.role, derivation.index],
  )
  return publicKeyLike(
    rawPublicKeyHex,
    publicKeyHashHexFromRawHex(rawPublicKeyHex),
  )
}

/**
 * Get delegation status for a wallet
 */
type PerAddressCertificatesDict = Record<
  string,
  Record<string, TimestampedCertMeta>
>

export const getWalletDelegationStatus = (
  rewardAddressHex: string,
  perRewardAddressCertificates: PerAddressCertificatesDict,
): ReturnType<typeof getDelegationStatus> => {
  const certsForKey = perRewardAddressCertificates[rewardAddressHex]
  return getDelegationStatus(rewardAddressHex, certsForKey || {})
}

/**
 * Get staking info for a wallet
 */
export const getWalletStakingInfo = async (wallet: {
  rewardAddressHex: string
  getAllUtxosForKey: () => Array<CardanoTypes.CardanoAddressedUtxo>
  fetchAccountState: () => Promise<AccountStateResponse>
  balanceManager: YoroiWallet['balanceManager']
  portfolioPrimaryTokenInfo: Portfolio.Token.Info
  getDelegationStatus: () => ReturnType<typeof getDelegationStatus>
}): Promise<StakingInfo> => {
  const stakingStatus = wallet.getDelegationStatus()
  if (!stakingStatus.isRegistered) return {status: 'not-registered'}
  if (!('poolKeyHash' in stakingStatus)) return {status: 'registered'}

  const accountStates = await wallet.fetchAccountState()
  const accountState = accountStates[wallet.rewardAddressHex]
  if (!accountState || accountState === null)
    throw new Error('Account state not found')

  const stakingUtxos = wallet.getAllUtxosForKey()
  const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id
  const remainingAmount = accountState.remainingAmount ?? Branded.ZERO_QUANTITY
  const amount = Quantities.sum([
    ...stakingUtxos.map(
      (utxo) =>
        (utxo.balance[primaryTokenId] ??
          Branded.ZERO_QUANTITY) as Balance.Quantity,
    ),
    remainingAmount as Balance.Quantity,
  ])

  wallet.balanceManager.updatePrimaryDerived({
    availableRewards: BigInt(remainingAmount),
  })

  return {
    status: 'staked',
    poolId: stakingStatus.poolKeyHash,
    amount,
    rewards: remainingAmount as Balance.Quantity,
  }
}
