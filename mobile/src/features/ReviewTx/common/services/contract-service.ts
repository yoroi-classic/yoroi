/**
 * Smart Contract Service
 *
 * Queries a service to get information about smart contract addresses
 */
import {addressInfoFromAddress} from '@yoroi-classic/cml-mobile-bridge'

import {logger} from '~/kernel/logger/logger'

import {
  AddressCredentialKind,
  addressCredentialKindFromHex,
} from '../address-kind'

export type SmartContractInfo = {
  address: string
  name?: string
  purpose?: string
  description?: string
  parameters?: Record<string, unknown>
  contractType?: 'plutus-v1' | 'plutus-v2' | 'plutus-v3'
}

export type ContractServiceConfig = {
  apiUrl: string
  timeout?: number
}

export type ContractService = {
  getContractInfo(address: string): Promise<SmartContractInfo | null>
  getManyContractInfo(
    addresses: string[],
  ): Promise<Record<string, SmartContractInfo | null>>
}

/**
 * Create a contract service instance
 */
export function createContractService(
  config: ContractServiceConfig,
): ContractService {
  const getContractInfo = async (
    address: string,
  ): Promise<SmartContractInfo | null> => {
    try {
      // Only query API if this is a contract address
      if (!isContractAddress(address)) {
        return null
      }

      const response = await fetch(`${config.apiUrl}/contracts/${address}`, {
        method: 'GET',
        signal: AbortSignal.timeout(config.timeout ?? 5000),
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      return {
        address,
        name: data.name,
        purpose: data.purpose,
        description: data.description,
        parameters: data.parameters,
        contractType: data.contractType,
      }
    } catch (error) {
      logger.error('Failed to fetch contract info', {error, address})
      return null
    }
  }

  return {
    getContractInfo,

    /**
     * Batch query contract information for multiple addresses
     */
    async getManyContractInfo(
      addresses: string[],
    ): Promise<Record<string, SmartContractInfo | null>> {
      const results = await Promise.all(
        addresses.map(async (address) => ({
          address,
          info: await getContractInfo(address),
        })),
      )

      return results.reduce(
        (acc, {address, info}) => {
          acc[address] = info
          return acc
        },
        {} as Record<string, SmartContractInfo | null>,
      )
    },
  }
}

/**
 * Check if an address is a smart contract address
 * This can be done locally by checking the address type
 */
export function isContractAddress(address: string): boolean {
  try {
    const {hex, isValid} = addressInfoFromAddress(address)
    return (
      isValid &&
      addressCredentialKindFromHex(hex) === AddressCredentialKind.Script
    )
  } catch {
    return false
  }
}
