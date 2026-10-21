import {scriptHashHexFromCbor} from '@yoroi-classic/cml-mobile-bridge'

import {calculatePolicyId, validateMintingScript} from './policies'
import type {MintingScript} from './types'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  scriptHashHexFromCbor: jest.fn(
    (_scriptType: string, scriptCborHex: string) => {
      if (!/^(?:[0-9a-f]{2})+$/i.test(scriptCborHex)) {
        throw new Error('Invalid script CBOR hex')
      }
      return 'policy_id_hex'
    },
  ),
}))

describe('minting policies', () => {
  describe('validateMintingScript', () => {
    it('should validate native script', () => {
      const script: MintingScript = {
        type: 'native',
        script: 'abcdef123456',
      }
      const result = validateMintingScript(script)

      expect(result.valid).toBe(true)
    })

    it('should validate plutus script', () => {
      const script: MintingScript = {
        type: 'plutus',
        script: 'abcdef123456',
        plutusVersion: 'plutusV2',
      }
      const result = validateMintingScript(script)

      expect(result.valid).toBe(true)
    })

    it.each([undefined, 'plutusV4'])(
      'should reject unsupported Plutus version %s',
      (plutusVersion) => {
        expect(
          validateMintingScript({
            type: 'plutus',
            script: 'abcdef123456',
            plutusVersion,
          } as MintingScript),
        ).toEqual({valid: false, error: 'Plutus script version is required'})
      },
    )

    it('should reject invalid script type', () => {
      const script = {type: 'invalid', script: 'abcdef'} as any
      const result = validateMintingScript(script)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid script type')
    })

    it('should reject missing script', () => {
      const script = {type: 'native'} as any
      const result = validateMintingScript(script)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Script must be a hex string')
    })

    it('should reject non-hex script', () => {
      const script: MintingScript = {
        type: 'native',
        script: 'invalid-hex!',
      }
      const result = validateMintingScript(script)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Script must be valid hex')
    })
  })

  describe('calculatePolicyId', () => {
    it('should calculate policy ID for native script', () => {
      const script: MintingScript = {
        type: 'native',
        script: 'abcdef123456',
      }
      const result = calculatePolicyId(script)

      expect(result).toBe('policy_id_hex')
      expect(scriptHashHexFromCbor).toHaveBeenCalledWith(
        'native',
        'abcdef123456',
      )
    })

    it('should calculate policy ID for plutus script', () => {
      const script: MintingScript = {
        type: 'plutus',
        script: 'abcdef123456',
        plutusVersion: 'plutusV3',
      }
      const result = calculatePolicyId(script)

      expect(result).toBe('policy_id_hex')
      expect(scriptHashHexFromCbor).toHaveBeenCalledWith(
        'plutusV3',
        'abcdef123456',
      )
    })

    it.each([undefined, 'plutusV4'])(
      'should reject unsupported Plutus version %s when calculating policy ID',
      (plutusVersion) => {
        expect(() =>
          calculatePolicyId({
            type: 'plutus',
            script: 'abcdef123456',
            plutusVersion,
          } as MintingScript),
        ).toThrow('Plutus script version is required to calculate policy ID')
      },
    )

    it('should throw error for invalid native script', () => {
      const script: MintingScript = {
        type: 'native',
        script: 'invalid',
      }
      expect(() => calculatePolicyId(script)).toThrow()
    })

    it('should throw error for invalid plutus script', () => {
      const script: MintingScript = {
        type: 'plutus',
        script: 'invalid',
        plutusVersion: 'plutusV1',
      }
      expect(() => calculatePolicyId(script)).toThrow()
    })
  })
})
