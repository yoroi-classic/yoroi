import {buildSimplePaymentTransaction, minimumCoinForAssets} from '@yoroi-classic/csl-mobile-bridge'
import {toAssetNameHex, toPolicyId} from '@yoroi/api'
import {Balance, Portfolio} from '@yoroi/types'

import {CardanoHaskellConfig, ModernUtxo, TransactionMetadata, TransactionOutput} from '@yoroi/tx'

export const buildSimplePaymentCml = ({
  inputs,
  outputs,
  changeAddress,
  ttl,
  protocolParams,
  primaryTokenId,
  metadata,
}: {
  inputs: ModernUtxo[]
  outputs: TransactionOutput[]
  changeAddress: string
  ttl: number
  protocolParams: CardanoHaskellConfig
  primaryTokenId: Portfolio.Token.Id
  metadata?: Array<{label: string; data: TransactionMetadata['data']}>
}): {cbor: string; fee: bigint} | undefined => {
  const assetsFromAmounts = (amounts: Balance.Amounts) =>
    Object.entries(amounts)
      .filter(([tokenId, quantity]) => tokenId !== primaryTokenId && BigInt(quantity) !== 0n)
      .map(([tokenId, quantity]) => ({
        policyIdHex: toPolicyId(tokenId),
        assetNameHex: toAssetNameHex(tokenId),
        quantity: String(quantity),
      }))
  // Byron source inputs require bootstrap witnesses. Keep those on the current
  // signing path until CML signing receives the source UTxO addressing path.
  if (inputs.some((input) => input.receiver.startsWith('Ae2') || input.receiver.startsWith('DdzFF'))) {
    return undefined
  }

  const result = buildSimplePaymentTransaction({
    inputs: inputs.map((input) => ({
      transactionHashHex: input.txHash,
      index: String(input.txIndex),
      address: input.receiver,
      lovelace: String(input.balance[primaryTokenId] ?? '0'),
      assets: assetsFromAmounts(input.balance),
    })),
    outputs: outputs.map((output) => ({
      address: output.address,
      lovelace: String(output.amounts[primaryTokenId] ?? '0'),
      assets: assetsFromAmounts(output.amounts),
      datum: output.datum
        ? 'hash' in output.datum
          ? {kind: 'hash' as const, hex: output.datum.hash}
          : {kind: 'inline' as const, hex: output.datum.data}
        : undefined,
    })),
    changeAddress,
    ttl: String(ttl),
    feeCoefficient: protocolParams.linearFee.coefficient,
    feeConstant: protocolParams.linearFee.constant,
    coinsPerUtxoByte: protocolParams.coinsPerUtxoByte,
    keyDeposit: protocolParams.keyDeposit,
    poolDeposit: protocolParams.poolDeposit,
    maxValueSize: '5000',
    metadata,
  })
  return {cbor: result.cborHex, fee: BigInt(result.fee)}
}

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
    .filter(([tokenId, quantity]) => tokenId !== primaryTokenId && BigInt(quantity) > 0n)
    .map(([tokenId, quantity]) => ({
      policyIdHex: toPolicyId(tokenId),
      assetNameHex: toAssetNameHex(tokenId),
      quantity: String(quantity),
    }))
  return BigInt(minimumCoinForAssets(address, assets, coinsPerUtxoByte))
}
