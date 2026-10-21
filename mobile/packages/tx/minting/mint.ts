import type {TransactionBuilderState} from '../transaction-builder/builder'
import type {MintAction, MintingScript} from './types'

/**
 * Add mint action to transaction builder
 *
 * @param state - Transaction builder state
 * @param mintAction - Mint action to add
 * @returns Updated transaction builder state
 */
export function addMint(
  state: TransactionBuilderState,
  mintAction: MintAction,
): TransactionBuilderState {
  const mints = state.options.mints || []

  // Check if policy already exists
  const existingIndex = mints.findIndex(
    (m) => m.policyId === mintAction.policyId,
  )

  if (existingIndex >= 0) {
    // Merge with existing mint action for same policy
    const existing = mints[existingIndex]!
    if (existing.script.type !== mintAction.script.type) {
      throw new Error('Cannot merge mint actions with different script types')
    }
    const updatedMints = [...mints]
    const mergedAssets = [...existing.assets, ...mintAction.assets]
    let merged: MintAction
    if (existing.script.type === 'native' && mintAction.script.type === 'native') {
      const referenceScript = mintAction.referenceScript ?? existing.referenceScript
      merged = {
        ...existing,
        assets: mergedAssets,
        ...(referenceScript ? {referenceScript} : {}),
      }
    } else if (existing.script.type === 'plutus' && mintAction.script.type === 'plutus') {
      const existingPlutus = existing as Extract<MintAction, {script: {type: 'plutus'}}>
      const mintPlutus = mintAction as Extract<MintAction, {script: {type: 'plutus'}}>
      const referenceScript = mintPlutus.referenceScript ?? existingPlutus.referenceScript
      merged = {
        ...existingPlutus,
        assets: mergedAssets,
        redeemer: mintPlutus.redeemer || existingPlutus.redeemer,
        redeemerExUnits: mintPlutus.redeemerExUnits || existingPlutus.redeemerExUnits,
        ...(referenceScript ? {referenceScript} : {}),
      }
    } else {
      throw new Error('Cannot merge mint actions with different script types')
    }
    updatedMints[existingIndex] = merged as MintAction

    return {
      ...state,
      options: {
        ...state.options,
        mints: updatedMints,
      },
    }
  }

  // Add new mint action
  return {
    ...state,
    options: {
      ...state.options,
      mints: [...mints, mintAction],
    },
  }
}

/**
 * Add multiple mint actions
 */
export function addMints(
  state: TransactionBuilderState,
  mintActions: MintAction[],
): TransactionBuilderState {
  let updatedState = state
  for (const mintAction of mintActions) {
    updatedState = addMint(updatedState, mintAction)
  }
  return updatedState
}

/**
 * Create mint action for a single asset
 */
export function createMintAction(
  policyId: string,
  assetName: string,
  amount: string,
  script: MintingScript,
  redeemer?: string,
  referenceScript?: NonNullable<MintAction['referenceScript']>,
  redeemerExUnits?: {mem: string; steps: string},
): MintAction {
  if (script.type === 'plutus' && (!redeemer || !redeemerExUnits)) {
    throw new Error('Plutus mint creation requires redeemer and execution units')
  }
  if (script.type === 'native' && (redeemer !== undefined || redeemerExUnits !== undefined)) {
    throw new Error('Native mint creation cannot include Plutus redeemer data')
  }
  if (script.type === 'native') {
    return {
      policyId,
      assets: [{assetName, amount}],
      script,
      ...(referenceScript ? {referenceScript} : {}),
    }
  }
  return {
    policyId,
    assets: [{assetName, amount}],
    script,
    redeemer: redeemer!,
    redeemerExUnits: redeemerExUnits!,
    ...(referenceScript ? {referenceScript} : {}),
  }
}

/**
 * Create burn action (negative mint)
 */
export function createBurnAction(
  policyId: string,
  assetName: string,
  amount: string,
  script: MintingScript,
  redeemer?: string,
  referenceScript?: NonNullable<MintAction['referenceScript']>,
  redeemerExUnits?: {mem: string; steps: string},
): MintAction {
  // Ensure amount is negative
  const burnAmount = amount.startsWith('-') ? amount : `-${amount}`
  return createMintAction(
    policyId,
    assetName,
    burnAmount,
    script,
    redeemer,
    referenceScript,
    redeemerExUnits,
  )
}

/**
 * Add burn action to transaction builder
 */
export function addBurn(
  state: TransactionBuilderState,
  policyId: string,
  assetName: string,
  amount: string,
  script: MintingScript,
  redeemer?: string,
  referenceScript?: NonNullable<MintAction['referenceScript']>,
  redeemerExUnits?: {mem: string; steps: string},
): TransactionBuilderState {
  const burnAction = createBurnAction(
    policyId,
    assetName,
    amount,
    script,
    redeemer,
    referenceScript,
    redeemerExUnits,
  )
  return addMint(state, burnAction)
}
