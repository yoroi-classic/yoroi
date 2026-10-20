import {getAddressUtxos, getUtxosByRef} from '@yoroi/cardano-wallet'
import {Chain} from '@yoroi/types'

import {logger} from '~/kernel/logger/logger'

import {
  ESCROW_SCRIPT_HASH,
  KNOWN_REFERENCE_SCRIPT_UTXOS,
  NIGHT_ASSET_NAME_HEX,
  NIGHT_POLICY_ID,
} from './constants'
import {parseEscrowDatum} from './datumParser'
import type {EscrowUtxo} from './types'

/**
 * Discover the current escrow UTxO at the given escrow address.
 * Uses CWB for both the script-address UTxO and its reference-script output.
 */
export async function discoverEscrowUtxo(
  escrowAddress: string,
  apiBaseUrl: string,
  network: Chain.SupportedNetworks,
): Promise<EscrowUtxo> {
  const nightTokenId = `${NIGHT_POLICY_ID}.${NIGHT_ASSET_NAME_HEX}`
  const utxos = await getAddressUtxos(escrowAddress, apiBaseUrl, network)

  // Find UTxO with NIGHT tokens and an inline datum
  const escrowUtxo = utxos.find((utxo) => {
    const hasNight = utxo.assets?.some(
      (a) => `${a.policyId}.${a.assetName}` === nightTokenId,
    )
    const hasDatum = !!utxo.inlineDatum
    return hasNight && hasDatum
  })

  if (!escrowUtxo || !escrowUtxo.inlineDatum) {
    logger.error('discoverEscrowUtxo: No escrow UTxO found', {
      escrowAddress,
      utxoCount: utxos.length,
    })
    throw new Error('No escrow UTxO found at address')
  }

  const nightAsset = escrowUtxo.assets.find(
    (a) => `${a.policyId}.${a.assetName}` === nightTokenId,
  )

  if (!nightAsset) {
    throw new Error('No NIGHT asset found in escrow UTxO')
  }

  const datumHex = escrowUtxo.inlineDatum
  if (!datumHex) throw new Error('Escrow UTxO has no inline datum CBOR')

  const datum = parseEscrowDatum(datumHex)

  const referenceOutputs = await getUtxosByRef(
    KNOWN_REFERENCE_SCRIPT_UTXOS.map(
      ({txHash, txIndex}) => `${txHash}#${txIndex}`,
    ),
    apiBaseUrl,
    network,
  )
  const referenceOutput = referenceOutputs.find(
    (utxo) =>
      !utxo.spent &&
      utxo.referenceScript?.hash === ESCROW_SCRIPT_HASH &&
      typeof utxo.referenceScript.bytes === 'string' &&
      typeof utxo.referenceScript.size === 'number' &&
      utxo.referenceScript.size === utxo.referenceScript.bytes.length / 2 &&
      typeof utxo.referenceScript.type === 'string',
  )
  if (
    !referenceOutput?.referenceScript?.bytes ||
    referenceOutput.referenceScript.size == null ||
    referenceOutput.referenceScript.type == null
  ) {
    throw new Error(
      'No live escrow reference-script UTxO with script CBOR was returned by CWB',
    )
  }

  return {
    txHash: escrowUtxo.txHash,
    txIndex: escrowUtxo.outputIndex,
    address: escrowUtxo.address,
    nightAmount: nightAsset.quantity,
    adaAmount: escrowUtxo.value,
    datumHex,
    datum,
    referenceScriptOutput: {
      txHash: referenceOutput.txHash,
      txIndex: referenceOutput.outputIndex,
      address: referenceOutput.address,
      value: referenceOutput.value,
      referenceScriptHash: referenceOutput.referenceScript.hash,
      referenceScriptSize: referenceOutput.referenceScript.size,
      referenceScriptType: referenceOutput.referenceScript.type,
      referenceScriptCborHex: referenceOutput.referenceScript.bytes,
      assets: referenceOutput.assets.map(({policyId, assetName, quantity}) => ({
        policyIdHex: policyId,
        assetNameHex: assetName,
        quantity,
      })),
    },
  }
}
