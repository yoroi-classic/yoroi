import {deriveEscrowAddress as deriveEscrowAddressCml} from '@yoroi-classic/cml-mobile-bridge'

import {ESCROW_SCRIPT_HASH} from './constants'

/**
 * Derive the escrow address for a given eligible address.
 * The escrow address uses the escrow script hash as payment credential
 * and keeps the same staking credential from the eligible address.
 */
export async function deriveEscrowAddress(
  eligibleAddress: string,
  networkId: number,
): Promise<string> {
  return deriveEscrowAddressCml({
    eligibleAddress,
    scriptHashHex: ESCROW_SCRIPT_HASH,
    networkId,
  })
}
