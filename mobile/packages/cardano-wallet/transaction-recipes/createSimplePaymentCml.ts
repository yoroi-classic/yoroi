import {
  CardanoHaskellConfig,
  ModernUtxo,
  TransactionMetadata,
  TransactionOutput,
  cmlAssetsFromAmounts,
  cmlPaymentInputFromUtxo,
  isByronAddress,
} from '@yoroi/tx'
import {NotEnoughMoneyToSendError, Portfolio} from '@yoroi/types'

import {buildSimplePaymentTransaction} from '@yoroi-classic/cml-mobile-bridge'

import {minimumAdaForAssetsCml} from '../cml/minimumAda'

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
  // Byron source inputs require bootstrap witnesses. Keep those on the current
  // signing path until CML signing receives the source UTxO addressing path.
  if (inputs.some((input) => isByronAddress(input.receiver))) {
    return undefined
  }

  let result: ReturnType<typeof buildSimplePaymentTransaction>
  try {
    result = buildSimplePaymentTransaction({
      inputs: inputs.map((input) =>
        cmlPaymentInputFromUtxo(input, primaryTokenId),
      ),
      outputs: outputs.map((output) => ({
        address: output.address,
        lovelace: String(output.amounts[primaryTokenId] ?? '0'),
        assets: cmlAssetsFromAmounts(output.amounts, primaryTokenId),
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
  } catch (error) {
    if (isInsufficientFundsError(error)) {
      throw new NotEnoughMoneyToSendError()
    }
    throw error
  }
  return {cbor: result.cborHex, fee: BigInt(result.fee)}
}

export {minimumAdaForAssetsCml}

const isInsufficientFundsError = (error: unknown): boolean => {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()
  return (
    /(?:insufficient|not enough)\s+(?:input(?: value)?|ada|funds?|balance)\b/.test(
      message,
    ) ||
    /(?:input(?: value)?|ada|funds?|balance)\s+(?:is\s+)?(?:insufficient|not enough)\b/.test(
      message,
    ) ||
    /(?:input|ada|funds?|balance) shortage|shortage of (?:input|ada|funds?|balance)|change exceeds input(?: value)?/.test(
      message,
    )
  )
}
