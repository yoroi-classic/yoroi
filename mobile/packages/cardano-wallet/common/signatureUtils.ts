import {cardanoConfig, derivationConfig} from '@yoroi/blockchains'
import {getLogger, throwLoggedError} from '@yoroi/logger'
import {Addressing} from '@yoroi/tx'
import {Balance, Branded, Wallet} from '@yoroi/types'

import {
  addressToHex,
  transactionSigningRequirementsJson,
} from '@yoroi-classic/cml-mobile-bridge'
import {uniqWith} from 'lodash'

import {getSpendingKey} from '../addressInfo/addressInfo'
import {CardanoTypes, YoroiWallet} from '../types'

export const convertBech32ToHex = (bech32Address: string) => {
  return addressToHex(bech32Address)
}

type TransactionSigningRequirements = {
  inputs: Array<{transactionIdHex: string; index: string}>
  collateralInputs: Array<{transactionIdHex: string; index: string}>
  requiredSigners: string[]
  hasStakingCertificate: boolean
  withdrawals: Array<{rewardAddressHex: string; amount: string}>
  nativeScriptKeyHashesHex: string[]
}

const getRequiredSigners = async (
  requirements: TransactionSigningRequirements,
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  partial = true,
): Promise<number[][]> => {
  const stakeVKHash = wallet.getStakingKey().hash().toHex()

  const implementation = meta.implementation

  const stakingKeyPath =
    implementation === 'cardano-cip1852'
      ? Array.from(
          cardanoConfig.implementations[implementation].features.staking
            .addressing,
        )
      : undefined

  const startLevel = derivationConfig.keyLevel.purpose
  const primaryTokenId = wallet.portfolioPrimaryTokenInfo.id

  const addressedUtxos: CardanoTypes.CardanoAddressedUtxo[] = wallet
    .allUtxos()
    .map((utxo) => {
      // Convert to modern Balance.Amounts format
      const balance: Balance.Amounts = {
        [primaryTokenId]: utxo.amount as Balance.Quantity,
      }
      for (const asset of utxo.assets) {
        balance[asset.tokenId] = asset.amount as Balance.Quantity
      }

      return {
        txHash: utxo.tx_hash,
        txIndex: utxo.tx_index,
        receiver: utxo.receiver,
        utxoId: utxo.utxo_id,
        balance,
        addressing: {
          path: getDerivationPathForAddress(
            utxo.receiver,
            wallet,
            meta,
            partial,
          ),
          startLevel,
        },
      }
    })

  const signers: Addressing[] = []
  const controlledAddresses = [
    ...wallet.externalAddresses(),
    ...wallet.internalAddresses(),
  ]
  const signerKeyHashes = [
    ...requirements.requiredSigners,
    ...requirements.nativeScriptKeyHashesHex,
  ]
  for (const keyHashHex of new Set(signerKeyHashes)) {
    if (stakingKeyPath && keyHashHex === stakeVKHash) {
      signers.push({path: stakingKeyPath, startLevel})
      continue
    }

    const address = controlledAddresses.find(
      (candidate) => getSpendingKey(candidate)?.toLowerCase() === keyHashHex,
    )
    if (!address) {
      if (!partial) {
        throw new Error(
          `Could not find addressing for required signer: ${keyHashHex}`,
        )
      }
      continue
    }
    signers.push({
      path: getDerivationPathForAddress(address, wallet, meta, partial),
      startLevel,
    })
  }

  const addInputAddressing = (input: {
    transactionIdHex: string
    index: string
  }) => {
    const index = Number(input.index)
    const matchingUtxo = addressedUtxos.find(
      (utxo) =>
        utxo.txHash === input.transactionIdHex && utxo.txIndex === index,
    )
    if (!matchingUtxo) {
      if (!partial) {
        throw new Error(
          `Could not find input utxo: ${input.transactionIdHex}:${input.index}`,
        )
      }
      return
    }
    signers.push(matchingUtxo.addressing)
  }
  requirements.inputs.forEach(addInputAddressing)
  requirements.collateralInputs.forEach(addInputAddressing)

  return getUniquePaths(signers.map((s: {path: number[]}) => s.path))
}

const getUniquePaths = (paths: number[][]) => {
  return uniqWith(paths, arePathsEqual)
}

const arePathsEqual = (path1: number[], path2: number[]) => {
  return (
    path1.every((value, index) => value === path2[index]) &&
    path1.length === path2.length
  )
}

export const getDerivationPathForAddress = (
  address: string,
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  partial = false,
) => {
  const addressBranded =
    typeof address === 'string' ? Branded.asAddress(address) : address
  const internalIndex = wallet.internalAddresses().indexOf(addressBranded)
  const externalIndex = wallet.externalAddresses().indexOf(addressBranded)
  const config = cardanoConfig.implementations[meta.implementation]
  const index = Math.max(internalIndex, externalIndex)

  if (internalIndex === -1 && externalIndex === -1) {
    if (!partial)
      throwLoggedError(getLogger())(
        'Could not find matching address ' + address,
      )
    return [
      config.derivations.base.harden.purpose,
      config.derivations.base.harden.coinType,
      derivationConfig.hardStart + wallet.accountVisual,
      config.derivations.base.roles.external,
      0,
    ]
  }

  const shouldUseInternal = internalIndex > -1
  const role = shouldUseInternal
    ? config.derivations.base.roles.internal
    : config.derivations.base.roles.external

  return [
    config.derivations.base.harden.purpose,
    config.derivations.base.harden.coinType,
    derivationConfig.hardStart + wallet.accountVisual,
    role,
    index,
  ]
}

export const getTransactionSigners = async (
  cbor: string,
  wallet: YoroiWallet,
  meta: Wallet.Meta,
  partial = true,
): Promise<number[][]> => {
  const requirements = JSON.parse(
    transactionSigningRequirementsJson(cbor),
  ) as TransactionSigningRequirements
  const signers = await getRequiredSigners(requirements, wallet, meta, partial)
  const implementation = meta.implementation
  if (
    implementation === 'cardano-cip1852' &&
    needsToSignWithStakingKey(requirements, wallet)
  ) {
    const implementationConfig = cardanoConfig.implementations[implementation]
    const additionalSigner: number[] = Array.from(
      implementationConfig.features.staking.addressing,
    )
    return [...signers, additionalSigner]
  }

  return signers
}

export const assertHasAllSigners = async (
  cbor: string,
  wallet: YoroiWallet,
  meta: Wallet.Meta,
) => {
  try {
    await getTransactionSigners(cbor, wallet, meta, false)
  } catch (error) {
    throwLoggedError(getLogger())('Missing keys to sign transaction')
  }
}

const needsToSignWithStakingKey = (
  requirements: TransactionSigningRequirements,
  wallet: YoroiWallet,
) => {
  return (
    requirements.hasStakingCertificate ||
    requirements.withdrawals.some(
      ({rewardAddressHex}) => rewardAddressHex === wallet.rewardAddressHex,
    )
  )
}
