import {scriptHashHexFromCbor} from '@yoroi-classic/cml-mobile-bridge'

import type {MintingScript} from './types'

/**
 * Calculate policy ID from script
 */
export function calculatePolicyId(script: MintingScript): string {
  const scriptType = script.type === 'native' ? 'native' : script.plutusVersion
  if (
    !scriptType ||
    (script.type === 'plutus' &&
      !['plutusV1', 'plutusV2', 'plutusV3'].includes(scriptType))
  ) {
    throw new Error('Plutus script version is required to calculate policy ID')
  }
  return scriptHashHexFromCbor(scriptType, script.script)
}

/**
 * Validate minting script format
 */
export function validateMintingScript(script: MintingScript): {
  valid: boolean
  error?: string
} {
  if (!script.type || (script.type !== 'native' && script.type !== 'plutus')) {
    return {valid: false, error: 'Invalid script type'}
  }

  if (!script.script || typeof script.script !== 'string') {
    return {valid: false, error: 'Script must be a hex string'}
  }

  if (!/^[0-9a-fA-F]+$/.test(script.script)) {
    return {valid: false, error: 'Script must be valid hex'}
  }

  if (
    script.type === 'plutus' &&
    !['plutusV1', 'plutusV2', 'plutusV3'].includes(script.plutusVersion ?? '')
  ) {
    return {valid: false, error: 'Plutus script version is required'}
  }

  return {valid: true}
}
