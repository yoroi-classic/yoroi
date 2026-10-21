import {Balance, Portfolio} from '@yoroi/types'

import {
  addressToHex,
  buildTransactionRecipeCml,
} from '@yoroi-classic/cml-mobile-bridge'
import type {
  CmlTransactionRecipeArguments,
  CmlTransactionRecipeCertificate,
  CmlTransactionRecipeOutput,
  CmlTransactionRecipeUtxo,
} from '@yoroi-classic/cml-mobile-bridge'

import {CardanoHaskellConfig} from '../types'
import {ModernUtxo} from '../utxo/models'
import {TransactionBuilderState} from './builder'
import {cmlAssetsFromAmounts} from './cml-value'
import {DRepValue, TransactionCertificate, TransactionOutput} from './types'

const toCredential = (credential: {
  kind: 'key' | 'script'
  hashHex: string
}) => ({
  kind: credential.kind,
  hashHex: credential.hashHex,
})

const toDRep = (drep: DRepValue) => {
  if (drep === 'AlwaysAbstain' || drep === 'AlwaysNoConfidence') return drep
  if ('KeyHash' in drep) return {KeyHash: drep.KeyHash}
  return {ScriptHash: drep.ScriptHash}
}

const cmlAddressFields = (address: string) => {
  const addressHex = addressToHex(address)
  const headerByte = Number.parseInt(addressHex.slice(0, 2), 16)
  if (!Number.isFinite(headerByte))
    throw new Error(`Invalid address: ${address}`)
  return {addressHex, isBootstrap: Math.floor(headerByte / 16) === 8}
}

const toCertificate = (
  certificate: TransactionCertificate,
): CmlTransactionRecipeCertificate => {
  switch (certificate.kind) {
    case 'StakeRegistration':
    case 'StakeDeregistration':
      return {
        kind: certificate.kind,
        stakeCredentialKeyHashHex: certificate.stakeCredentialKeyHashHex,
      }
    case 'StakeDelegation':
      return {
        kind: certificate.kind,
        stakeCredentialKeyHashHex: certificate.stakeCredentialKeyHashHex,
        poolKeyHash: certificate.poolKeyHash,
      }
    case 'VoteDelegation':
      return {
        kind: certificate.kind,
        stakeCredentialKeyHashHex: certificate.stakeCredentialKeyHashHex,
        drep: toDRep(certificate.drep),
      }
    case 'StakeAndVoteDelegation':
    case 'StakeVoteRegistrationAndDelegation':
    case 'VoteRegistrationAndDelegation':
    case 'StakeRegistrationAndDelegation':
      return {
        kind: certificate.kind,
        stakeCredentialKeyHashHex: certificate.stakeCredentialKeyHashHex,
        ...('poolKeyHash' in certificate && certificate.poolKeyHash
          ? {poolKeyHash: certificate.poolKeyHash}
          : {}),
        ...('drep' in certificate && certificate.drep
          ? {drep: toDRep(certificate.drep)}
          : {}),
      }
    case 'PoolRegistration':
      return {kind: certificate.kind, poolParams: certificate.poolParams}
    case 'PoolRetirement':
      return {
        kind: certificate.kind,
        poolKeyHash: certificate.poolKeyHash,
        epoch: certificate.epoch,
      }
    case 'MoveInstantaneousRewardsCert':
      return {
        kind: certificate.kind,
        pot: certificate.pot === 0 ? 'reserves' : 'treasury',
        rewards: certificate.rewards,
      }
    case 'GenesisKeyDelegation':
      return {
        kind: certificate.kind,
        genesisHashHex: certificate.genesisHashHex,
        genesisDelegateHashHex: certificate.genesisDelegateHashHex,
        vrfKeyHashHex: certificate.vrfKeyHashHex,
      }
    case 'CommitteeHotAuth':
      return {
        kind: certificate.kind,
        coldCredential: toCredential(certificate.coldCredential),
        hotCredential: toCredential(certificate.hotCredential),
      }
    case 'CommitteeColdResign':
      return {
        kind: certificate.kind,
        coldCredential: toCredential(certificate.coldCredential),
        ...(certificate.anchor ? {anchor: certificate.anchor} : {}),
      }
    case 'DRepRegistration':
    case 'DRepDeregistration':
    case 'DRepUpdate':
      return {
        kind: certificate.kind,
        credential: toCredential(certificate.credential),
        ...('deposit' in certificate && certificate.deposit !== undefined
          ? {deposit: certificate.deposit}
          : {}),
        ...('anchor' in certificate && certificate.anchor
          ? {anchor: certificate.anchor}
          : {}),
      }
  }
}

const toUtxo = (
  utxo: ModernUtxo,
  primaryTokenId: Portfolio.Token.Id,
): CmlTransactionRecipeUtxo => {
  return {
    txHashHex: utxo.txHash,
    index: String(utxo.txIndex),
    address: utxo.receiver,
    ...cmlAddressFields(utxo.receiver),
    lovelace: String(utxo.balance[primaryTokenId] ?? '0'),
    assets: cmlAssetsFromAmounts(utxo.balance, primaryTokenId),
    ...(utxo.inlineDatumCborHex
      ? {inlineDatumCborHex: utxo.inlineDatumCborHex}
      : {}),
    ...(utxo.datumHashHex ? {datumHashHex: utxo.datumHashHex} : {}),
    ...(utxo.referenceScript ? {referenceScript: utxo.referenceScript} : {}),
  }
}

const toOutput = (
  output: TransactionOutput,
  primaryTokenId: Portfolio.Token.Id,
): CmlTransactionRecipeOutput => ({
  address: output.address,
  lovelace: String(output.amounts[primaryTokenId] ?? '0'),
  assets: cmlAssetsFromAmounts(output.amounts, primaryTokenId),
  ...(output.datum
    ? {
        datum:
          'hash' in output.datum
            ? {kind: 'hash' as const, hex: output.datum.hash}
            : {kind: 'inline' as const, hex: output.datum.data},
      }
    : {}),
})

/** Convert the app's transaction recipe to the lossless CML bridge contract. */
export const toCmlTransactionRecipeArguments = (
  state: TransactionBuilderState,
  protocolParams: CardanoHaskellConfig,
  primaryTokenId: Portfolio.Token.Id,
): CmlTransactionRecipeArguments => {
  const changeAddress =
    state.options.changeAddress ?? state.options.manualChangeOutput?.address
  if (
    !changeAddress &&
    (!state.options.manualFee || state.options.manualChangeOutput)
  ) {
    throw new Error(
      'A change address is required unless fee and outputs are explicit',
    )
  }

  const protocol = {
    linearFee: protocolParams.linearFee,
    coinsPerUtxoByte: protocolParams.coinsPerUtxoByte,
    keyDeposit: protocolParams.keyDeposit,
    poolDeposit: protocolParams.poolDeposit,
    maxValueSize: '5000',
    maxTxSize: '16384',
    ...(protocolParams.collateralPercentage
      ? {collateralPercentage: protocolParams.collateralPercentage}
      : {}),
    ...(protocolParams.refScriptCoinsPerByte
      ? {refScriptCoinsPerByte: protocolParams.refScriptCoinsPerByte}
      : {}),
    ...(protocolParams.refScriptTierStepBytes
      ? {refScriptTierStepBytes: protocolParams.refScriptTierStepBytes}
      : {}),
    ...(protocolParams.refScriptMultiplier
      ? {refScriptMultiplier: protocolParams.refScriptMultiplier}
      : {}),
    ...(protocolParams.scriptExecutionPrices
      ? {
          exUnitPricesMemory: protocolParams.scriptExecutionPrices.memory,
          exUnitPricesSteps: protocolParams.scriptExecutionPrices.cpu,
        }
      : {}),
    ...(protocolParams.plutusV1CostModel
      ? {plutusV1CostModel: protocolParams.plutusV1CostModel}
      : {}),
    ...(protocolParams.plutusV2CostModel
      ? {plutusV2CostModel: protocolParams.plutusV2CostModel}
      : {}),
    ...(protocolParams.plutusV3CostModel
      ? {plutusV3CostModel: protocolParams.plutusV3CostModel}
      : {}),
  }

  return {
    protocolParams: protocol,
    inputs: state.inputs.map((input) => {
      const kind = input.kind ?? 'paymentKey'
      if (kind === 'nativeScript' && !input.nativeScriptCborHex) {
        throw new Error('Native-script input requires its script CBOR')
      }
      if (kind === 'nativeScript' && !input.nativeScriptWitnessCount) {
        throw new Error('Native-script input requires signer-count metadata')
      }
      return {
        ...toUtxo(input.utxo, primaryTokenId),
        kind,
        ...(input.nativeScriptCborHex
          ? {nativeScriptCborHex: input.nativeScriptCborHex}
          : {}),
        ...(input.nativeScriptWitnessCount
          ? {nativeScriptWitnessCount: input.nativeScriptWitnessCount}
          : kind === 'nativeScript'
            ? {nativeScriptWitnessCount: '0'}
            : {}),
      }
    }),
    outputs: state.outputs.map((output) => toOutput(output, primaryTokenId)),
    certificates: state.certificates.map(toCertificate),
    withdrawals: state.withdrawals.map(({rewardAddress, amount}) => ({
      rewardAddress,
      amount: String(amount),
    })),
    referenceInputs: state.referenceInputs.map(({utxo}) =>
      toUtxo(utxo, primaryTokenId),
    ),
    scriptInputs: state.scriptInputs.map((scriptInput) => {
      const reference = scriptInput.referenceScriptUtxo
      const referenceOutput = reference?.output
      const legacyInlineScript = !reference && !scriptInput.inlineScriptCborHex
      const version =
        reference?.langVersion ??
        scriptInput.plutusVersion ??
        (legacyInlineScript ? 'v1' : undefined)
      if (!version)
        throw new Error('Inline Plutus script requires a language version')
      if (reference && !referenceOutput?.scriptCborHex) {
        throw new Error('A Plutus spend requires reference script bytes')
      }
      // Before inlineScriptCborHex was explicit, the CSL builder's inline
      // branch interpreted scriptHash as PlutusScript CBOR (V1). Preserve that
      // public recipe behavior while new callers use the explicit fields.
      const inlineScriptCborHex = reference
        ? undefined
        : (scriptInput.inlineScriptCborHex ?? scriptInput.scriptHash)
      return {
        utxo: toUtxo(scriptInput.utxo, primaryTokenId),
        ...(reference || !legacyInlineScript
          ? {scriptHashHex: scriptInput.scriptHash}
          : {}),
        plutusVersion: version.toUpperCase() as 'V1' | 'V2' | 'V3',
        ...(!reference && inlineScriptCborHex ? {inlineScriptCborHex} : {}),
        redeemerCborHex: scriptInput.redeemer,
        redeemerMem: scriptInput.redeemerExUnits.mem,
        redeemerSteps: scriptInput.redeemerExUnits.steps,
        datumSource:
          scriptInput.datumSource === 'inline'
            ? 'inline'
            : {
                kind: 'explicit' as const,
                cborHex: scriptInput.datumSource.data,
              },
        ...(reference
          ? {
              referenceScript: {
                utxo: {
                  txHashHex: reference.txHash,
                  index: String(reference.txIndex),
                  address: referenceOutput!.address,
                  ...cmlAddressFields(referenceOutput!.address),
                  lovelace: referenceOutput!.lovelace,
                  assets: referenceOutput!.assets,
                },
                scriptCborHex: referenceOutput!.scriptCborHex,
                size: String(reference.scriptSize),
              },
            }
          : {}),
      }
    }),
    collateralInputs: state.collateralInputs.map(({utxo}) =>
      toUtxo(utxo, primaryTokenId),
    ),
    mints: (state.options.mints ?? []).map((mint) => {
      const scriptType =
        mint.script.type === 'native' ? 'native' : mint.script.plutusVersion
      if (!scriptType)
        throw new Error('Plutus mint requires a script language version')
      if (
        mint.script.type === 'plutus' &&
        (!mint.redeemer || !mint.redeemerExUnits)
      ) {
        throw new Error(
          'Plutus mint requires redeemer data and execution units',
        )
      }
      if (mint.script.type === 'plutus' && !mint.script.plutusVersion) {
        throw new Error('Plutus mint requires a script language version')
      }
      const output = mint.referenceScript?.output
      if (mint.referenceScript && !output) {
        throw new Error(
          'Reference mint requires the referenced output and script bytes',
        )
      }
      return {
        policyIdHex: mint.policyId,
        scriptType: scriptType as
          | 'native'
          | 'plutusV1'
          | 'plutusV2'
          | 'plutusV3',
        scriptCborHex: mint.script.script,
        assets: mint.assets.map(({assetName, amount}) => ({
          assetNameHex: assetName,
          quantity: String(amount),
        })),
        ...(mint.redeemer ? {redeemerCborHex: mint.redeemer} : {}),
        ...(mint.redeemerExUnits
          ? {
              redeemerMem: mint.redeemerExUnits.mem,
              redeemerSteps: mint.redeemerExUnits.steps,
            }
          : {}),
        ...(mint.referenceScript
          ? {
              referenceInput: {
                txHashHex: mint.referenceScript.txHash,
                index: String(mint.referenceScript.txIndex),
                address: output?.address ?? '',
                ...(output ? cmlAddressFields(output.address) : {}),
                lovelace: output?.lovelace ?? '0',
                assets: output?.assets ?? [],
                ...(output
                  ? {
                      referenceScript: {
                        hash: mint.policyId,
                        type:
                          mint.script.type === 'native'
                            ? 'native'
                            : mint.script.plutusVersion!,
                        size: output.scriptCborHex.length / 2,
                        bytes: output.scriptCborHex,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      }
    }),
    metadata: state.metadata.map(({label, data}) => ({
      label: String(label),
      data,
    })),
    options: {
      ...(changeAddress ? {changeAddress} : {}),
      ...(state.options.validityInterval?.end !== undefined ||
      state.options.ttl !== undefined
        ? {
            ttl: String(
              state.options.validityInterval?.end ?? state.options.ttl,
            ),
          }
        : {}),
      ...(state.options.validityInterval
        ? {
            validityIntervalStart: String(state.options.validityInterval.start),
            validityIntervalEnd: String(state.options.validityInterval.end),
          }
        : {}),
      ...(state.options.manualFee
        ? {manualFee: String(state.options.manualFee[primaryTokenId] ?? '0')}
        : {}),
      ...(state.options.manualChangeOutput
        ? {
            manualChangeOutput: toOutput(
              state.options.manualChangeOutput,
              primaryTokenId,
            ),
          }
        : {}),
    },
  }
}

/** Build a recipe, solving CIP-40 total collateral and fee to a fixed point. */
export const buildCmlTransactionRecipe = (
  state: TransactionBuilderState,
  protocolParams: CardanoHaskellConfig,
  primaryTokenId: Portfolio.Token.Id,
): {cborHex: string; fee: string} => {
  const base = toCmlTransactionRecipeArguments(
    state,
    protocolParams,
    primaryTokenId,
  )
  const hasPlutusWitness =
    state.scriptInputs.length > 0 ||
    (state.options.mints ?? []).some((mint) => mint.script.type === 'plutus')
  if (!hasPlutusWitness) {
    if (state.collateralInputs.length > 0) {
      throw new Error('Collateral inputs require a Plutus witness')
    }
    return buildTransactionRecipeCml(base)
  }
  if (state.collateralInputs.length === 0) {
    throw new Error('Plutus transactions require at least one collateral input')
  }
  const percentage = protocolParams.collateralPercentage
  if (!percentage || !/^\d+$/.test(percentage) || BigInt(percentage) <= 0n) {
    throw new Error(
      'Plutus transactions require a positive protocol collateral percentage',
    )
  }

  const collateralAmounts = new Map<string, bigint>()
  for (const {utxo} of state.collateralInputs) {
    for (const [tokenId, quantity] of Object.entries(utxo.balance)) {
      const amount = BigInt(quantity)
      if (amount < 0n)
        throw new Error('Collateral UTxO values cannot be negative')
      collateralAmounts.set(
        tokenId,
        (collateralAmounts.get(tokenId) ?? 0n) + amount,
      )
    }
  }
  const collateralCoin = collateralAmounts.get(primaryTokenId) ?? 0n
  let result = buildTransactionRecipeCml(base)
  let builtForTotal: string | undefined
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!/^\d+$/.test(result.fee))
      throw new Error('CML returned an invalid fee')
    const fee = BigInt(result.fee)
    const percent = BigInt(percentage)
    const required = (fee * percent + 99n) / 100n
    if (required === BigInt(builtForTotal ?? '-1')) return result
    if (collateralCoin < required) {
      throw new Error(
        `Collateral contains ${collateralCoin.toString()} lovelace but ${required.toString()} is required`,
      )
    }
    const totalCollateral = required.toString()
    const returnBalance = Object.fromEntries(
      [...collateralAmounts].map(([tokenId, quantity]) => [
        tokenId,
        (tokenId === primaryTokenId
          ? quantity - required
          : quantity
        ).toString(),
      ]),
    ) as Balance.Amounts
    const returnCoin = collateralCoin - required
    const returnAssets = cmlAssetsFromAmounts(returnBalance, primaryTokenId)
    const collateralReturn =
      returnCoin > 0n || returnAssets.length > 0
        ? {
            address: state.collateralInputs[0]!.utxo.receiver,
            lovelace: returnCoin.toString(),
            assets: returnAssets,
          }
        : undefined
    builtForTotal = totalCollateral
    result = buildTransactionRecipeCml({
      ...base,
      totalCollateral,
      ...(collateralReturn ? {collateralReturn} : {}),
    })
  }
  throw new Error('CML collateral fee calculation did not converge')
}
