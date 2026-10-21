/** Split a Yoroi token identifier into its serialized policy/name components. */
export const identifierToAssetHex = (
  tokenId: string,
): {policyIdHex: string; assetNameHex: string} => {
  const subject = tokenId.replace('.', '')
  return {
    policyIdHex: subject.slice(0, 56),
    assetNameHex: subject.slice(56, 56 + 32 * 2),
  }
}
