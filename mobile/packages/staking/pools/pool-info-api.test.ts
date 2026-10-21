import {normalizePoolIdentifier} from '@yoroi-classic/cml-mobile-bridge'

import {
  DEFAULT_SATURATION_THRESHOLD,
  TRANSITION_DATA_STUB,
  TransitionData,
  getMaybeNewEntriesByPool,
  normalisePoolIdentifierOrKey,
} from './pool-info-api'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  normalizePoolIdentifier: jest.fn((poolIdOrHash: string) => {
    const knownHash = '0ef7aa564933ce75b695cdad66be4a39b43a22726de7c58908e0e033'
    if (!poolIdOrHash.match(/^(pool1|[0-9a-f]{56})/i)) {
      throw new Error('Invalid pool identifier')
    }
    if (
      poolIdOrHash !==
        'pool1pmm654jfx088td54ekkkd0j28x6r5gnjdhnutzggursrxjnpk2y' &&
      poolIdOrHash.toLowerCase() !== knownHash
    ) {
      throw new Error('Invalid pool identifier')
    }
    return {
      id: 'pool1pmm654jfx088td54ekkkd0j28x6r5gnjdhnutzggursrxjnpk2y',
      hash: knownHash,
    }
  }),
}))

describe('pool-info-api utilities', () => {
  describe('getMaybeNewEntriesByPool', () => {
    it('should return new entries and deadline when pool is found and enabled', () => {
      const transitionData: TransitionData = {
        new: {
          emurgo: ['pool1', 'pool2'],
        },
        old: {
          emurgo: [['pool123', 1234567890, true]],
        },
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toEqual({
        newEntries: ['pool1', 'pool2'],
        deadline: 1234567890,
      })
    })

    it('should return null when pool is found but disabled', () => {
      const transitionData: TransitionData = {
        new: {
          emurgo: ['pool1', 'pool2'],
        },
        old: {
          emurgo: [['pool123', 1234567890, false]],
        },
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toBeNull()
    })

    it('should return null when pool is not found', () => {
      const transitionData: TransitionData = {
        new: {
          emurgo: ['pool1', 'pool2'],
        },
        old: {
          emurgo: [['other-pool', 1234567890, true]],
        },
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toBeNull()
    })

    it('should return null when new entries are missing', () => {
      const transitionData: TransitionData = {
        new: {},
        old: {
          emurgo: [['pool123', 1234567890, true]],
        },
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toBeNull()
    })

    it('should search across multiple groups', () => {
      const transitionData: TransitionData = {
        new: {
          yoroi: ['pool3', 'pool4'],
        },
        old: {
          emurgo: [['other-pool', 1234567890, true]],
          yoroi: [['pool123', 9876543210, true]],
        },
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toEqual({
        newEntries: ['pool3', 'pool4'],
        deadline: 9876543210,
      })
    })

    it('should handle empty old entries', () => {
      const transitionData = {
        new: {
          emurgo: ['pool1'],
        },
        old: {
          emurgo: [],
        },
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toBeNull()
    })

    it('should handle missing old entries group', () => {
      const transitionData = {
        new: {
          emurgo: ['pool1'],
        },
        old: {},
      }

      const result = getMaybeNewEntriesByPool('pool123', transitionData)

      expect(result).toBeNull()
    })
  })

  describe('normalisePoolIdentifierOrKey', () => {
    it('normalizes bech32 pool ID to pool identity through CML', () => {
      const bech32Id =
        'pool1pmm654jfx088td54ekkkd0j28x6r5gnjdhnutzggursrxjnpk2y'
      const result = normalisePoolIdentifierOrKey(bech32Id)

      expect(result.id).toBe(bech32Id)
      expect(result.hash).toBe(
        '0ef7aa564933ce75b695cdad66be4a39b43a22726de7c58908e0e033',
      )
      expect(normalizePoolIdentifier).toHaveBeenCalledWith(bech32Id)
      expect(normalisePoolIdentifierOrKey(result.hash)).toEqual(result)
    })

    it('normalizes uppercase hex hashes and rejects malformed identifiers', () => {
      const bech32Id =
        'pool1pmm654jfx088td54ekkkd0j28x6r5gnjdhnutzggursrxjnpk2y'
      const expected = normalisePoolIdentifierOrKey(bech32Id)
      const result = normalisePoolIdentifierOrKey(expected.hash.toUpperCase())
      expect(result.id).toBe(bech32Id)
      expect(result.hash).toBe(expected.hash)
      expect(() => normalisePoolIdentifierOrKey('not-a-pool')).toThrow()
    })
  })

  describe('constants', () => {
    it('should have correct DEFAULT_SATURATION_THRESHOLD', () => {
      expect(DEFAULT_SATURATION_THRESHOLD).toBe(0.8)
    })

    it('should have TRANSITION_DATA_STUB defined', () => {
      expect(TRANSITION_DATA_STUB).toBeDefined()
      expect(TRANSITION_DATA_STUB.new).toBeDefined()
      expect(TRANSITION_DATA_STUB.old).toBeDefined()
    })
  })
})
