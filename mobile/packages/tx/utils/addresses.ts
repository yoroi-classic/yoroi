// Cardano address utilities
// Cardano-specific address normalization and manipulation functions
import {Address, AddressBech32, AddressHex} from '@yoroi/types'

import {
  addressInfoFromAddress,
  stakeCredentialHexFromAddress,
} from '@yoroi-classic/cml-mobile-bridge'

import {Addressing} from '../types'

/**
 * Check if an address is a Byron address by checking common prefixes
 * This is a fast check that uses the CML address parser
 * @param address - The address string to check
 * @returns true if the address appears to be a Byron address, false otherwise
 */
export function isByronAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  try {
    // CML normalizes Byron addresses to their CBOR-encoded Address bytes.
    // Checking the parsed representation avoids accepting prefix-lookalikes.
    return addressInfoFromAddress(address.trim())
      .hex.toLowerCase()
      .startsWith('82d818')
  } catch {
    return false
  }
}

/**
 * Primitive address information extracted by CML.
 */
export type AddressInfo = {
  networkId: number
  hex: AddressHex
  bech32: AddressBech32 | null
  isValid: boolean
}

/**
 * Validate an address and return normalized primitive values from CML.
 */
export async function validateAndExtractAddressInfo(
  addr: Address | string,
): Promise<AddressInfo | undefined> {
  const addrStr = typeof addr === 'string' ? addr : addr

  try {
    const info = addressInfoFromAddress(addrStr)
    return {
      networkId: info.networkId,
      hex: info.hex as AddressHex,
      bech32: info.bech32 as AddressBech32 | null,
      isValid: true,
    }
  } catch {
    return undefined
  }
}

/** Normalize hex, bech32 or Byron input to canonical serialized address hex. */
export function normalizeAddressToHex(
  addr: Address | string,
): AddressHex | undefined {
  try {
    return addressInfoFromAddress(String(addr)).hex as AddressHex
  } catch {
    return undefined
  }
}

/** Filter UTxOs by the serialized stake credential carried in Shelley base addresses. */
export async function filterAddressesByStakingKey<
  T extends {receiver: Address},
>(
  stakingCredentialCborHex: string,
  utxos: ReadonlyArray<T>,
  acceptTypeMismatch: boolean,
): Promise<ReadonlyArray<T>> {
  const result: T[] = []
  for (const utxo of utxos) {
    if (
      await addrContainsAccountKey(
        utxo.receiver,
        stakingCredentialCborHex,
        acceptTypeMismatch,
      )
    ) {
      result.push(utxo)
    }
  }
  return result
}

/** Check if an address contains the given stake credential using CML. */
export async function addrContainsAccountKey(
  address: Address | string,
  targetAccountCredentialCborHex: string,
  acceptTypeMismatch: boolean,
): Promise<boolean> {
  const addrStr = typeof address === 'string' ? address : address
  let info: AddressInfo
  try {
    const parsed = addressInfoFromAddress(addrStr)
    info = {
      ...parsed,
      hex: parsed.hex as AddressHex,
      bech32: parsed.bech32 as AddressBech32 | null,
    }
  } catch {
    throw new Error(`addrContainsAccountKey invalid address ${addrStr}`)
  }
  const addressKind = Number.parseInt(info.hex.slice(0, 2), 16) >> 4
  if (addressKind > 3) return acceptTypeMismatch
  return (
    stakeCredentialHexFromAddress(addrStr) === targetAccountCredentialCborHex ||
    acceptTypeMismatch
  )
}

/**
 * Derive public key by addressing
 */
export const derivePublicByAddressing = <T extends {derive(index: number): T}>(
  addressing: Addressing,
  startingFrom: {
    key: T
    level: number
  },
): T => {
  if (startingFrom.level + 1 < addressing.startLevel) {
    throw new Error('derivePublicByAddressing: keyLevel < startLevel')
  }

  let derivedKey = startingFrom.key

  for (
    let i = startingFrom.level - addressing.startLevel + 1;
    i < addressing.path.length;
    i++
  ) {
    const pathIndex = addressing.path[i]
    if (pathIndex === undefined) {
      throw new Error('Invalid addressing path')
    }
    derivedKey = derivedKey.derive(pathIndex)
  }

  return derivedKey
}
