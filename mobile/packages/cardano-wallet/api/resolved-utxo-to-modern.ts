import {ResolvedUtxo} from '@yoroi/api'
import {primaryTokenId} from '@yoroi/portfolio'
import {rawUtxoToModernUtxo} from '@yoroi/tx'
import {Portfolio} from '@yoroi/types'

/** Preserve all CWB-resolved output metadata when adapting to the tx package. */
export const resolvedUtxoToModernUtxo = (utxo: ResolvedUtxo) => {
  if (utxo.spent) throw new Error('Cannot adapt a spent UTxO')

  return rawUtxoToModernUtxo(
    {
      amount: utxo.value,
      receiver: utxo.address,
      tx_hash: utxo.txHash,
      tx_index: utxo.outputIndex,
      utxo_id: `${utxo.txHash}:${utxo.outputIndex}`,
      assets: utxo.assets.map(({policyId, assetName, quantity}) => ({
        amount: quantity,
        tokenId: `${policyId}.${assetName}` as Portfolio.Token.Id,
        policyId,
        name: assetName,
      })),
      datumHash: utxo.datumHash,
      inlineDatum: utxo.inlineDatum,
      referenceScriptHash: utxo.referenceScriptHash,
      referenceScript: utxo.referenceScript,
    },
    undefined,
    undefined,
    primaryTokenId,
  )
}
