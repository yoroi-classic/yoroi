import {CmlTransactionReviewInfo, TransactionBody} from './types'

export const cmlReviewBodyToTransactionBody = (
  reviewInfo: CmlTransactionReviewInfo,
): TransactionBody => {
  const {body} = reviewInfo
  return {
    cmlReviewInfo: reviewInfo,
    inputs: body.inputs.map((input) => ({
      transaction_id: input.transactionIdHex,
      index: Number(input.index),
    })),
    outputs: body.outputs.map((output) => ({
      address: output.address ?? output.addressHex,
      amount: {
        coin: output.lovelace,
        multiasset: output.assets.reduce<
          Record<string, Record<string, string>>
        >((multiasset, asset) => {
          const policyAssets = (multiasset[asset.policyIdHex] ??= {})
          policyAssets[asset.assetNameHex] = asset.quantity
          return multiasset
        }, {}),
      },
    })),
    fee: body.fee,
    reference_inputs: (body.referenceInputs ?? []).map((input) => ({
      transaction_id: input.transactionIdHex,
      index: Number(input.index),
    })),
    certs: Array.isArray(body.certificates)
      ? (body.certificates as Array<Record<string, unknown>>)
      : null,
    mint: toLegacyMintShape(body.mint),
    auxiliary_data_hash: body.auxiliaryDataHashHex ?? null,
  }
}

const toLegacyMintShape = (
  mint: unknown,
): Array<[string, Record<string, string>]> | null => {
  if (mint == null || typeof mint !== 'object' || Array.isArray(mint))
    return null

  return Object.entries(mint).map(([policyId, assets]) => {
    if (assets == null || typeof assets !== 'object' || Array.isArray(assets)) {
      return [policyId, {}]
    }

    return [
      policyId,
      Object.fromEntries(
        Object.entries(assets).map(([assetName, quantity]) => [
          assetName,
          String(quantity),
        ]),
      ),
    ]
  })
}
