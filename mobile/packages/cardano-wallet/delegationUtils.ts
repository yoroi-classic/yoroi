import {StakingStatus} from '@yoroi/staking'
import {
  CardanoAddressedUtxo,
  filterAddressesByStakingKey as filterAddressesByCmlStakingKey,
} from '@yoroi/tx'

import {normalizePoolIdentifier} from '@yoroi-classic/cml-mobile-bridge'
import {sortBy} from 'lodash'

import type {TimestampedCertMeta} from './transactionManager/transactionManager'

export const filterAddressesByStakingKey = async (
  stakingCredentialCborHex: string,
  utxos: ReadonlyArray<CardanoAddressedUtxo>,
  acceptTypeMismatch: boolean,
) => {
  return filterAddressesByCmlStakingKey(
    stakingCredentialCborHex,
    utxos,
    acceptTypeMismatch,
  )
}

export const getDelegationStatus = (
  rewardAddress: string,
  txCertificatesForKey: Record<string, TimestampedCertMeta> = {},
): StakingStatus => {
  const sortedCerts = sortBy(
    txCertificatesForKey,
    (txCerts) => txCerts.submittedAt,
  )
  let status: StakingStatus = {isRegistered: false}

  for (const certData of Object.values(sortedCerts)) {
    const certificates = certData.certificates

    for (const cert of certificates) {
      if (!('rewardAddress' in cert) || cert.rewardAddress !== rewardAddress)
        continue

      if (cert.kind === 'StakeDelegation') {
        status = {
          poolKeyHash: cert.poolKeyHash,
          isRegistered: true,
        }
      } else if (cert.kind === 'StakeRegistration') {
        status = {isRegistered: true}
      } else if (cert.kind === 'StakeDeregistration') {
        status = {isRegistered: false}
      }
    }
  }

  return status
}

export const isValidPoolIdOrHash = (poolIdOrHash: string): boolean => {
  const [validPoolId, validPoolHash] = [
    isValidPoolId(poolIdOrHash),
    isValidPoolHash(poolIdOrHash),
  ]
  return validPoolId || validPoolHash
}

export const normalizeToPoolHash = (poolIdOrHash: string): string => {
  return normalizePoolIdentifier(poolIdOrHash).hash
}

const isValidPoolId = (poolId: string): boolean => {
  if (poolId.length === 0) return false
  try {
    normalizePoolIdentifier(poolId)
    return true
  } catch {
    return false
  }
}

export const getPoolBech32Id = (poolId: string) => {
  return normalizePoolIdentifier(poolId).id
}

const isValidPoolHash = (poolHash: string): boolean => {
  return /^[0-9a-fA-F]{56}$/.test(poolHash)
}
