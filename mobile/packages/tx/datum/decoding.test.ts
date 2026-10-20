import {decodeDatum, decodeDatumToJson, formatDecodedDatum} from './decoding'
import type {DecodedDatum} from './decoding'
import type {Datum} from './types'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  decodePlutusDataCborHex: jest.fn(() => JSON.stringify({type: 'integer', value: '42'})),
}))

describe('datum decoding', () => {
  describe('decodeDatum', () => {
    it('should decode valid PlutusData hex', () => {
      const {decodePlutusDataCborHex} = jest.requireMock('@yoroi-classic/csl-mobile-bridge')
      const result = decodeDatum('d8799f')

      expect(result).toEqual({
        type: 'integer',
        value: '42',
      })
      expect(decodePlutusDataCborHex).toHaveBeenCalledWith('d8799f')
    })

    it('should return null for invalid hex', () => {
      const {decodePlutusDataCborHex} = jest.requireMock('@yoroi-classic/csl-mobile-bridge')
      decodePlutusDataCborHex.mockImplementationOnce(() => { throw new Error('Invalid hex') })
      const result = decodeDatum('invalid')

      expect(result).toBeNull()
    })
  })

  describe('decodeDatumToJson', () => {
    it('should return null for hash-only datum', () => {
      const datum: Datum = {
        type: 'hash',
        hash: 'hash123',
      }
      const result = decodeDatumToJson(datum)

      expect(result).toBeNull()
    })

    it('should decode inline datum to JSON', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'd8799f',
      }
      const result = decodeDatumToJson(datum)

      expect(result).toBe('42')
    })

    it('should return null when decoding fails', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'invalid',
      }
      const {decodePlutusDataCborHex} = jest.requireMock('@yoroi-classic/csl-mobile-bridge')
      decodePlutusDataCborHex.mockImplementationOnce(() => { throw new Error('Invalid') })
      const result = decodeDatumToJson(datum)

      expect(result).toBeNull()
    })
  })

  describe('formatDecodedDatum', () => {
    it('should format integer datum', () => {
      const datum: DecodedDatum = {type: 'integer', value: '42'}
      const result = formatDecodedDatum(datum)

      expect(result).toBe('42')
    })

    it('should format bytes datum', () => {
      const datum: DecodedDatum = {type: 'bytes', value: 'abcdef'}
      const result = formatDecodedDatum(datum)

      expect(result).toBe('0xabcdef')
    })

    it('should format string datum', () => {
      const datum: DecodedDatum = {type: 'string', value: 'hello'}
      const result = formatDecodedDatum(datum)

      expect(result).toBe('"hello"')
    })

    it('should format empty list', () => {
      const datum: DecodedDatum = {type: 'list', items: []}
      const result = formatDecodedDatum(datum)

      expect(result).toBe('[]')
    })

    it('should format list with items', () => {
      const datum: DecodedDatum = {
        type: 'list',
        items: [
          {type: 'integer', value: '1'},
          {type: 'integer', value: '2'},
        ],
      }
      const result = formatDecodedDatum(datum)

      expect(result).toContain('1')
      expect(result).toContain('2')
      expect(result).toContain('[')
      expect(result).toContain(']')
    })

    it('should format empty map', () => {
      const datum: DecodedDatum = {type: 'map', entries: []}
      const result = formatDecodedDatum(datum)

      expect(result).toBe('{}')
    })

    it('should format map with entries', () => {
      const datum: DecodedDatum = {
        type: 'map',
        entries: [
          {
            key: {type: 'string', value: 'key1'},
            value: {type: 'integer', value: '42'},
          },
        ],
      }
      const result = formatDecodedDatum(datum)

      expect(result).toContain('key1')
      expect(result).toContain('42')
      expect(result).toContain('{')
      expect(result).toContain('}')
    })

    it('should format constructor datum', () => {
      const datum: DecodedDatum = {
        type: 'constructor',
        index: 0,
        fields: [{type: 'integer', value: '42'}],
      }
      const result = formatDecodedDatum(datum)

      expect(result).toContain('Constructor(0)')
      expect(result).toContain('42')
    })

    it('should format unknown datum', () => {
      const datum: DecodedDatum = {type: 'unknown', hex: 'abcdef'}
      const result = formatDecodedDatum(datum)

      expect(result).toContain('<unknown: abcdef>')
    })

    it('should use custom indent', () => {
      const datum: DecodedDatum = {type: 'integer', value: '42'}
      const result = formatDecodedDatum(datum, 2)

      expect(result).toBe('    42') // 2 * 2 spaces = 4 spaces
    })
  })
})
