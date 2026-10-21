import {
  escrowDatumInfoJson,
  updatedEscrowDatumCborHex,
} from '@yoroi-classic/cml-mobile-bridge'

import type {EscrowDatum} from './types'

/**
 * Parse an escrow inline datum from CBOR hex.
 *
 * Datum structure:
 * Constr(0, [
 *   address: Constr(0, [payment_cred: Constr(0, [ByteString(28)]), staking_cred]),
 *   night_per_thaw: Integer,
 *   next_thaw_time: Integer (ms),
 *   thaws_remaining: Integer,
 *   interval: Integer (ms)
 * ])
 */
export function parseEscrowDatum(datumHex: string): EscrowDatum {
  const info = JSON.parse(escrowDatumInfoJson(datumHex)) as {
    paymentCredHash: string
    stakingCredHash: string | null
    nightPerThaw: string
    nextThawTime: string
    thawsRemaining: string
    interval: string
  }
  return {
    paymentCredHash: info.paymentCredHash,
    stakingCredHash: info.stakingCredHash,
    nightPerThaw: BigInt(info.nightPerThaw),
    nextThawTime: BigInt(info.nextThawTime),
    thawsRemaining: BigInt(info.thawsRemaining),
    interval: BigInt(info.interval),
  }
}

/**
 * Build an updated escrow datum CBOR hex with decremented thaws and advanced next thaw time.
 */
export function buildUpdatedDatumHex(datumHex: string): string {
  return updatedEscrowDatumCborHex(datumHex)
}
