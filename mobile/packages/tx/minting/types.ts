/**
 * Minting script type
 */
export type MintingScriptType = 'native' | 'plutus'

export type MintingScript =
  | {type: 'native'; script: string; plutusVersion?: never}
  | {
      type: 'plutus'
      script: string
      plutusVersion: 'plutusV1' | 'plutusV2' | 'plutusV3'
    }

export type MintReferenceScript = {
  txHash: string
  txIndex: number
  output: {
    address: string
    lovelace: string
    assets: Array<{policyIdHex: string; assetNameHex: string; quantity: string}>
    scriptCborHex: string
  }
}

/**
 * Asset to mint
 */
export type MintAsset = {
  assetName: string // Asset name hex
  amount: string // Quantity (can be negative for burning)
}

/**
 * Mint action for a policy
 */
type MintActionBase = {
  policyId: string // Policy ID (script hash)
  assets: MintAsset[] // Assets to mint under this policy
  referenceScript?: MintReferenceScript
}

export type MintAction = MintActionBase &
  (
    | {
        script: Extract<MintingScript, {type: 'native'}>
        redeemer?: never
        redeemerExUnits?: never
      }
    | {
        script: Extract<MintingScript, {type: 'plutus'}>
        redeemer: string
        redeemerExUnits: {mem: string; steps: string}
      }
  )

/**
 * Minting result
 */
export type MintingResult = {
  policyId: string
  assetName: string
  amount: string
  tokenId: string // Full token ID (policyId.assetName)
}
