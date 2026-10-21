/** Credential kind encoded in the high nibble of a Cardano address header. */
export type AddressCredentialKind = 0 | 1 | null
export const AddressCredentialKind = {Key: 0, Script: 1} as const

/**
 * Classify a validated Cardano address from its serialized header byte.
 * Key credentials are 0 and script credentials are 1, matching ReviewTx's
 * persisted/formatted data contract without requiring a native runtime object.
 */
export const addressCredentialKindFromHex = (
  addressHex: string,
): AddressCredentialKind => {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(addressHex)) return null

  const addressType = Math.floor(
    Number.parseInt(addressHex.slice(0, 2), 16) / 16,
  )
  switch (addressType) {
    case 0: // base: key / key
    case 2: // base: key / script
    case 4: // pointer: key
    case 6: // enterprise: key
    case 14: // reward: key
      return 0
    case 1: // base: script / key
    case 3: // base: script / script
    case 5: // pointer: script
    case 7: // enterprise: script
    case 15: // reward: script
      return 1
    default:
      return null
  }
}
