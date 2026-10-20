import {toAssetNameHex, toPolicyId} from '@yoroi/api'
import {Portfolio} from '@yoroi/types'

import {
  addressInfoFromAddress,
  minimumCoinForAssets,
} from '@yoroi-classic/csl-mobile-bridge'

/** Calculate the ledger minimum coin for an output using CML. */
export const minimumAdaForAssetsCml = ({
  address,
  amounts,
  primaryTokenId,
  coinsPerUtxoByte,
}: {
  address: string
  amounts: Readonly<Record<string, string | bigint>>
  primaryTokenId: Portfolio.Token.Id
  coinsPerUtxoByte: string
}): bigint => {
  const assets = Object.entries(amounts)
    .filter(
      ([tokenId, quantity]) =>
        tokenId !== primaryTokenId && BigInt(quantity) > 0n,
    )
    .map(([tokenId, quantity]) => ({
      policyIdHex: toPolicyId(tokenId as Portfolio.Token.Id),
      assetNameHex: toAssetNameHex(tokenId as Portfolio.Token.Id),
      quantity: String(quantity),
    }))
  // The CML minimum-coin adapter accepts bech32 and Byron base58. Normalize
  // legacy Shelley hex addresses through CML first to preserve the old API.
  const normalizedAddress = addressInfoFromAddress(address).bech32 ?? address
  return BigInt(
    minimumCoinForAssets(normalizedAddress, assets, coinsPerUtxoByte),
  )
}
