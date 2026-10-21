import {Address} from '@yoroi/types'

import {addressInfoFromAddress} from '@yoroi-classic/cml-mobile-bridge'
import {Buffer} from 'buffer'

type ParsedAddress = {
  hex: string
  networkId: number
  bech32: string | null
  isValid: true
}

/** Parse address forms with CML and expose only serializable address data. */
export function toCardanoAddressInfo(
  address: Address | string,
): ParsedAddress | null {
  try {
    return addressInfoFromAddress(String(address))
  } catch {
    return null
  }
}

function credentialHashFromAddress(
  address: Address | string,
  credential: 'payment' | 'staking',
): string | null {
  const info = toCardanoAddressInfo(address)
  if (!info) return null

  const bytes = Buffer.from(info.hex, 'hex')
  if (bytes.length === 0) return null
  const addressKind = bytes[0]! >> 4

  // Base addresses have payment and stake credentials. Pointer and enterprise
  // addresses have a payment credential only; reward addresses have a stake
  // credential only. Byron addresses do not contain Shelley credentials.
  if (credential === 'payment') {
    if (addressKind >= 14 && addressKind <= 15) {
      if (bytes.length !== 29 || addressKind === 15) return ''
      return bytes.subarray(1, 29).toString('hex')
    }
    if (addressKind > 7 || bytes.length < 29) return null
    if ((addressKind & 1) === 1) return '' // Script credential, not a key hash.
    return bytes.subarray(1, 29).toString('hex')
  }

  if (addressKind >= 14 && addressKind <= 15) {
    return ''
  }
  if (addressKind >= 0 && addressKind <= 3) {
    if (bytes.length !== 57 || ((addressKind >> 1) & 1) === 1) return ''
    return bytes.subarray(29, 57).toString('hex')
  }
  return null
}

/** Extract a payment key hash from Shelley base, enterprise, or reward addresses. */
export function getSpendingKey(address: Address | string): string | null {
  return credentialHashFromAddress(address, 'payment')
}

/** Extract a stake key hash from Shelley base or reward addresses. */
export function getStakingKey(address: Address | string): string | null {
  return credentialHashFromAddress(address, 'staking')
}

/** Return true only when a parsed Shelley address has the requested stake key credential. */
export function addressUsesStakingKey(
  address: Address | string,
  keyHashHex: string,
): boolean {
  return getStakingKey(address) === keyHashHex.toLowerCase()
}
