import {toAssetNameHex, toPolicyId} from '@yoroi/api'

/** Split a Yoroi token identifier into its serialized policy/name components. */
export const identifierToAssetHex = (
  tokenId: string,
): {policyIdHex: string; assetNameHex: string} => ({
  policyIdHex: toPolicyId(tokenId),
  assetNameHex: toAssetNameHex(tokenId),
})
