import {Address, Balance, Chain, Portfolio} from '@yoroi/types'

import {minimumAdaForAssetsCml} from './cml/minimumAda'
import {Amounts, Quantities, asQuantity} from './utils/utils'

export const withMinAmounts = async (
  address: Address | string,
  amounts: Balance.Amounts,
  primaryTokenInfo: Portfolio.Token.Info,
  protocolParams: Chain.Cardano.ProtocolParams,
): Promise<Balance.Amounts> => {
  const amountsWithPrimaryToken = withPrimaryToken(amounts, primaryTokenInfo)
  const minAmounts = await getMinAmounts(
    address,
    amountsWithPrimaryToken,
    primaryTokenInfo,
    protocolParams,
  )

  return Amounts.map(amountsWithPrimaryToken, (amount) => ({
    ...amount,
    quantity: Quantities.max(
      amount.quantity,
      Amounts.getAmount(minAmounts, amount.tokenId).quantity,
    ),
  }))
}

export const getMinAmounts = async (
  address: Address | string,
  amounts: Balance.Amounts,
  primaryTokenInfo: Portfolio.Token.Info,
  protocolParams: Chain.Cardano.ProtocolParams,
) => {
  const addrStr = typeof address === 'string' ? address : address
  // Ensure primary token is included (with 0 if not present).
  const amountsWithPrimary = withPrimaryToken(amounts, primaryTokenInfo)
  let minAda: bigint
  try {
    minAda = minimumAdaForAssetsCml({
      address: addrStr,
      amounts: amountsWithPrimary,
      primaryTokenId: primaryTokenInfo.id,
      coinsPerUtxoByte: protocolParams.coinsPerUtxoByte,
    })
  } catch {
    throw new Error('getMinAmounts::Error not a valid address')
  }

  return {
    [primaryTokenInfo.id]: asQuantity(minAda.toString()),
  } as Balance.Amounts
}

export const withPrimaryToken = (
  amounts: Balance.Amounts,
  primaryTokenInfo: Portfolio.Token.Info,
): Balance.Amounts => {
  if (Amounts.includes(amounts, primaryTokenInfo.id)) return amounts

  return {
    ...amounts,
    [primaryTokenInfo.id]: Quantities.zero,
  }
}
