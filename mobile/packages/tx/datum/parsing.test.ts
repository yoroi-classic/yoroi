import {datumFromInfo, getDatumHash, parseDatumFromOutput} from './parsing'
import type {Datum, DatumInfo} from './types'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  hashPlutusDataCborHex: jest.fn(() => 'computed_hash'),
  datumInfoFromOutputCborHex: jest.fn(() => JSON.stringify({type: 'inline', hash: 'datum-hash', data: 'd87980'})),
}))

describe('datum parsing', () => {
  it('extracts datum information from output CBOR through CML', () => {
    const {datumInfoFromOutputCborHex} = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
    expect(parseDatumFromOutput('aabb')).toEqual({
      type: 'inline',
      hash: 'datum-hash',
      data: 'd87980',
    })
    expect(datumInfoFromOutputCborHex).toHaveBeenCalledWith('aabb')
  })

  describe('datumFromInfo', () => {
    it('should create inline datum from info', () => {
      const info: DatumInfo = {
        type: 'inline',
        hash: 'hash123',
        data: 'data456',
      }
      const result = datumFromInfo(info)

      expect(result).toEqual({
        type: 'inline',
        data: 'data456',
      })
    })

    it('should create embedded datum from info', () => {
      const info: DatumInfo = {
        type: 'embedded',
        hash: 'hash123',
        data: 'data456',
      }
      const result = datumFromInfo(info)

      expect(result).toEqual({
        type: 'embedded',
        data: 'data456',
      })
    })

    it('should create hash datum from info', () => {
      const info: DatumInfo = {
        type: 'hash',
        hash: 'hash123',
      }
      const result = datumFromInfo(info)

      expect(result).toEqual({
        type: 'hash',
        hash: 'hash123',
      })
    })
  })

  describe('convertLegacyDatum', () => {
    it('should convert legacy datum with data to inline', () => {
      const {convertLegacyDatum} = require('./parsing')
      const legacy = {data: 'data123'}
      const result = convertLegacyDatum(legacy)

      expect(result).toEqual({
        type: 'inline',
        data: 'data123',
      })
    })

    it('should convert legacy datum with hash to hash datum', () => {
      const {convertLegacyDatum} = require('./parsing')
      const legacy = {hash: 'hash123'}
      const result = convertLegacyDatum(legacy)

      expect(result).toEqual({
        type: 'hash',
        hash: 'hash123',
      })
    })

    it('should return null when legacy datum has neither data nor hash', () => {
      const {convertLegacyDatum} = require('./parsing')
      const legacy = {}
      const result = convertLegacyDatum(legacy)

      expect(result).toBeNull()
    })
  })

  describe('getDatumHash', () => {
    it('should return hash directly for hash datum', () => {
      const datum: Datum = {
        type: 'hash',
        hash: 'hash123',
      }
      const result = getDatumHash(datum)
      expect(result).toBe('hash123')
    })

    it('should compute hash for inline datum', () => {
      const datum: Datum = {
        type: 'inline',
        data: 'data123',
      }
      const {hashPlutusDataCborHex} = jest.requireMock('@yoroi-classic/cml-mobile-bridge')
      const result = getDatumHash(datum)
      expect(result).toBe('computed_hash')
      expect(hashPlutusDataCborHex).toHaveBeenCalledWith('data123')
    })

    it('should compute hash for embedded datum', () => {
      const datum: Datum = {
        type: 'embedded',
        data: 'data123',
      }
      const result = getDatumHash(datum)
      expect(result).toBe('computed_hash')
    })

    it('should throw error for invalid datum type', () => {
      const datum = {type: 'invalid'} as any
      expect(() => getDatumHash(datum)).toThrow('Invalid datum type')
    })
  })
})
