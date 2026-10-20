import {toAssetNameHex, toPolicyId} from '@yoroi/api'
import type {CardanoHaskellConfig} from '@yoroi/tx'
import type {ModernUtxo} from '@yoroi/tx'
import type {Balance, Portfolio} from '@yoroi/types'

import {buildEscrowRedeemTransactionCml} from '@yoroi-classic/csl-mobile-bridge'

import {logger} from '~/kernel/logger/logger'

import {
  ESCROW_SCRIPT_HASH,
  NIGHT_ASSET_NAME_HEX,
  NIGHT_POLICY_ID,
  SHELLEY_SLOT_CONFIG,
} from './constants'
import {buildUpdatedDatumHex} from './datumParser'
import type {EscrowUtxo} from './types'

const NIGHT_TOKEN_ID =
  `${NIGHT_POLICY_ID}.${NIGHT_ASSET_NAME_HEX}` as Portfolio.Token.Id

/**
 * Convert milliseconds since epoch to Cardano slot number.
 */
function msToSlot(ms: bigint): number {
  const unixSeconds = Number(ms / 1000n)
  return (
    unixSeconds - SHELLEY_SLOT_CONFIG.zeroTime + SHELLEY_SLOT_CONFIG.zeroSlot
  )
}

/**
 * Create a ModernUtxo-like object for the escrow UTxO.
 * Since escrow UTxOs come from chain query (not wallet), we construct manually.
 */
function escrowToModernUtxo(
  escrowUtxo: EscrowUtxo,
  primaryTokenId: Portfolio.Token.Id,
): ModernUtxo {
  const balance: Balance.Amounts = {
    [primaryTokenId]: escrowUtxo.adaAmount as Balance.Quantity,
    [NIGHT_TOKEN_ID]: escrowUtxo.nightAmount as Balance.Quantity,
  }

  return {
    receiver: escrowUtxo.address,
    txHash: escrowUtxo.txHash,
    txIndex: escrowUtxo.txIndex,
    balance,
    inlineDatumCborHex: escrowUtxo.datumHex,
    toTransactionUnspentOutputHex: () => {
      throw new Error('Not needed for script inputs')
    },
    toTransactionUnspentOutput: () => {
      throw new Error('Not needed for script inputs')
    },
  } as unknown as ModernUtxo
}

function toCmlUtxo(utxo: ModernUtxo, primaryTokenId: Portfolio.Token.Id) {
  const assets = Object.entries(utxo.balance)
    .filter(([tokenId]) => tokenId !== primaryTokenId)
    .map(([tokenId, quantity]) => ({
      policyIdHex: toPolicyId(tokenId as Portfolio.Token.Id),
      assetNameHex: toAssetNameHex(tokenId as Portfolio.Token.Id),
      quantity,
    }))
  return {
    txHashHex: utxo.txHash,
    index: utxo.txIndex.toString(),
    address: utxo.receiver,
    lovelace: utxo.balance[primaryTokenId] ?? '0',
    assets,
    ...(utxo.inlineDatumCborHex
      ? {inlineDatumCborHex: utxo.inlineDatumCborHex}
      : {}),
  }
}

export type BuildEscrowRedeemTxParams = {
  escrowUtxo: EscrowUtxo
  eligibleAddress: string
  fundingUtxos: ModernUtxo[]
  collateralUtxo: ModernUtxo
  changeAddress: string
  protocolParams: CardanoHaskellConfig
  primaryTokenId: Portfolio.Token.Id
  currentSlot: number
}

/**
 * Build an escrow redeem transaction for thaw #2+.
 * Returns the unsigned transaction CBOR hex.
 */
export async function buildEscrowRedeemTx(
  params: BuildEscrowRedeemTxParams,
): Promise<string> {
  const {
    escrowUtxo,
    eligibleAddress,
    fundingUtxos,
    collateralUtxo,
    changeAddress,
    protocolParams,
    primaryTokenId,
    currentSlot,
  } = params

  const {datum} = escrowUtxo

  if (datum.thawsRemaining <= 0n) {
    throw new Error('No thaws remaining in escrow')
  }

  const nightPerThaw = datum.nightPerThaw.toString()
  const totalNight = BigInt(escrowUtxo.nightAmount)
  const remainingNight = totalNight - datum.nightPerThaw

  logger.info('buildEscrowRedeemTx: Building transaction', {
    escrowTxHash: escrowUtxo.txHash,
    escrowTxIndex: escrowUtxo.txIndex,
    nightPerThaw: nightPerThaw,
    thawsRemaining: datum.thawsRemaining.toString(),
    totalNight: totalNight.toString(),
    remainingNight: remainingNight.toString(),
  })

  const escrowModernUtxo = escrowToModernUtxo(escrowUtxo, primaryTokenId)
  const refScriptUtxo = escrowUtxo.referenceScriptOutput

  // Output 1: NIGHT to eligible address
  const eligibleOutputAmounts: Balance.Amounts = {
    [primaryTokenId]: '1176630' as Balance.Quantity, // min ADA for token output
    [NIGHT_TOKEN_ID]: nightPerThaw as Balance.Quantity,
  }
  const outputs: Parameters<
    typeof buildEscrowRedeemTransactionCml
  >[0]['outputs'] = [
    {
      address: eligibleAddress,
      lovelace: String(eligibleOutputAmounts[primaryTokenId] ?? '0'),
      assets: [
        {
          policyIdHex: toPolicyId(NIGHT_TOKEN_ID),
          assetNameHex: toAssetNameHex(NIGHT_TOKEN_ID),
          quantity: String(eligibleOutputAmounts[NIGHT_TOKEN_ID] ?? '0'),
        },
      ],
    },
  ]

  // Output 2: Escrow change (if thaws remaining > 1)
  if (datum.thawsRemaining > 1n) {
    const updatedDatumHex = buildUpdatedDatumHex(datum)
    const escrowChangeAmounts: Balance.Amounts = {
      [primaryTokenId]: escrowUtxo.adaAmount as Balance.Quantity,
      [NIGHT_TOKEN_ID]: remainingNight.toString() as Balance.Quantity,
    }
    outputs.push({
      address: escrowUtxo.address,
      lovelace: String(escrowChangeAmounts[primaryTokenId] ?? '0'),
      assets: [
        {
          policyIdHex: toPolicyId(NIGHT_TOKEN_ID),
          assetNameHex: toAssetNameHex(NIGHT_TOKEN_ID),
          quantity: String(escrowChangeAmounts[NIGHT_TOKEN_ID] ?? '0'),
        },
      ],
      datumCborHex: updatedDatumHex,
    })
  }

  // Validity interval: must be after thaw date, within reasonable TTL
  const thawSlot = msToSlot(datum.nextThawTime)
  const invalidBefore = Math.max(thawSlot, currentSlot)
  const invalidAfter = currentSlot + 7200 // ~2 hours TTL
  const refScriptCoinsPerByte = protocolParams.refScriptCoinsPerByte
  const refScriptTierStepBytes = protocolParams.refScriptTierStepBytes
  const refScriptMultiplier = protocolParams.refScriptMultiplier
  const plutusV3CostModel = protocolParams.plutusV3CostModel
  const scriptExecutionPrices = protocolParams.scriptExecutionPrices
  if (
    !refScriptCoinsPerByte ||
    !refScriptTierStepBytes ||
    !refScriptMultiplier ||
    !plutusV3CostModel ||
    !scriptExecutionPrices
  ) {
    throw new Error(
      'Missing reference-script fee, execution-unit prices, or Plutus V3 cost model parameters',
    )
  }

  const {cborHex} = buildEscrowRedeemTransactionCml({
    scriptInput: toCmlUtxo(escrowModernUtxo, primaryTokenId),
    additionalScriptInputs: [],
    referenceScriptInput: {
      txHashHex: refScriptUtxo.txHash,
      index: refScriptUtxo.txIndex.toString(),
      address: escrowUtxo.referenceScriptOutput.address,
      lovelace: escrowUtxo.referenceScriptOutput.value,
      assets: escrowUtxo.referenceScriptOutput.assets,
    },
    referenceInputs: [],
    referenceScriptCborHex:
      escrowUtxo.referenceScriptOutput.referenceScriptCborHex,
    referenceScriptSize:
      escrowUtxo.referenceScriptOutput.referenceScriptSize.toString(),
    fundingInputs: fundingUtxos.map((utxo) => toCmlUtxo(utxo, primaryTokenId)),
    collateralInput: toCmlUtxo(collateralUtxo, primaryTokenId),
    outputs,
    changeAddress,
    scriptHashHex: ESCROW_SCRIPT_HASH,
    redeemerCborHex: 'd87980',
    redeemerMem: '900000',
    redeemerSteps: '250000000',
    validityStart: invalidBefore.toString(),
    ttl: invalidAfter.toString(),
    feeCoefficient: protocolParams.linearFee.coefficient,
    feeConstant: protocolParams.linearFee.constant,
    coinsPerUtxoByte: protocolParams.coinsPerUtxoByte,
    keyDeposit: protocolParams.keyDeposit,
    poolDeposit: protocolParams.poolDeposit,
    maxValueSize: '5000',
    maxTxSize: '16384',
    collateralPercentage: protocolParams.collateralPercentage ?? '150',
    refScriptCoinsPerByte,
    refScriptTierStepBytes,
    refScriptMultiplier,
    exUnitPricesMemory: scriptExecutionPrices.memory,
    exUnitPricesSteps: scriptExecutionPrices.cpu,
    plutusV3CostModel,
  })

  logger.info('buildEscrowRedeemTx: Transaction built successfully', {
    cborLength: cborHex.length,
  })

  return cborHex
}
