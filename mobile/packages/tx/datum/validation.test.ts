import type {Datum} from './types'
import {
  validateDatum,
  validateDatumHash,
  validatePlutusData,
} from './validation'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  hashPlutusDataCborHex: jest.fn(() => 'hash123'),
}))

describe('datum validation', () => {
  describe('validateDatum', () => {
    it('should validate hash datum with valid hash', () => {
      const datum: Datum = {
        type: 'hash',
        hash: 'a'.repeat(64),
      }
      const result = validateDatum(datum)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject hash datum with invalid hash format', () => {
      const datum: Datum = {
        type: 'hash',
        hash: 'invalid',
      }
      const result = validateDatum(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Datum hash must be 64 hex characters')
    })

    it('should reject hash datum with missing hash', () => {
      const datum = {type: 'hash'} as any
      const result = validateDatum(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid datum hash')
    })

    it('should validate inline datum with valid hex data', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'abcdef123456',
      }
      const result = validateDatum(datum)

      expect(result.valid).toBe(true)
    })

    it('should reject inline datum with invalid hex data', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'invalid-hex!',
      }
      const result = validateDatum(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Datum data must be hex string')
    })

    it('should reject inline datum with missing data', () => {
      const datum = {type: 'inline'} as any
      const result = validateDatum(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid datum data')
    })

    it('should validate embedded datum', () => {
      const datum: Datum = {
        type: 'embedded',
        data: 'abcdef123456',
      }
      const result = validateDatum(datum)

      expect(result.valid).toBe(true)
    })

    it('should reject unknown datum type', () => {
      const datum = {type: 'unknown'} as any
      const result = validateDatum(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Unknown datum type')
    })
  })

  describe('validatePlutusData', () => {
    it('should validate hash datum (data not available)', () => {
      const datum: Datum = {
        type: 'hash',
        hash: 'a'.repeat(64),
      }
      const result = validatePlutusData(datum)

      expect(result.valid).toBe(true)
    })

    it('should validate inline datum with valid PlutusData', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'd8799f',
      }
      const {hashPlutusDataCborHex} = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
      const result = validatePlutusData(datum)

      expect(result.valid).toBe(true)
      expect(hashPlutusDataCborHex).toHaveBeenCalledWith('d8799f')
    })

    it('should reject inline datum with invalid hex format', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'invalid-hex!',
      }
      const result = validatePlutusData(datum)

      expect(result.valid).toBe(false)
      // Format validation happens first
      expect(result.error).toBe('Datum data must be hex string')
    })

    it('should reject when CML cannot parse PlutusData', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'abcdef123456', // Valid hex format but invalid PlutusData
      }
      const {hashPlutusDataCborHex} = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
      hashPlutusDataCborHex.mockImplementationOnce(() => { throw new Error('Invalid Plutus data CBOR') })
      const result = validatePlutusData(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid Plutus data CBOR')
    })

    it('should first validate datum format', () => {
      const datum = {type: 'hash'} as any
      const result = validatePlutusData(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid datum hash')
    })
  })

  describe('validateDatumHash', () => {
    it('should validate hash datum (cannot validate)', () => {
      const datum: Datum = {
        type: 'hash',
        hash: 'a'.repeat(64),
      }
      const result = validateDatumHash(datum)

      expect(result.valid).toBe(true)
    })

    it('should validate inline datum hash', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'data123',
      }
      const result = validateDatumHash(datum)

      expect(result.valid).toBe(true)
    })

    it('should reject when hash calculation fails', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'invalid',
      }
      const {hashPlutusDataCborHex} = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
      hashPlutusDataCborHex.mockImplementationOnce(() => { throw new Error('Invalid data') })
      const result = validateDatumHash(datum)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid data')
    })
  })
})
