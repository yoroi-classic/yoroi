import {
  addWitness,
  clearWitnesses,
  createWitnessState,
  getMissingSigners,
  getRequiredSignersFromTransaction,
  getWitnesses,
  isFullySigned,
  setRequiredSigners,
} from './multiparty'
import type {WitnessState} from './multiparty'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn((address: string) => {
    const keyHash = 'ab'.repeat(28)
    const kind =
      address === 'reward-key'
        ? 'e1'
        : address === 'payment-script'
          ? '71'
          : '01'
    return {
      hex: `${kind}${keyHash}${'cd'.repeat(28)}`,
      networkId: 1,
      bech32: address,
      isValid: true,
    }
  }),
  nativeScriptKeyHashesJson: jest.fn(() => JSON.stringify([])),
}))

describe('multiparty transaction', () => {
  const createMockWitness = (keyHash: string) => ({
    witness: {} as any,
    signerKeyHash: keyHash,
  })

  it('extracts payment and reward key hashes from CML-normalized address bytes', async () => {
    const keyHash = 'ab'.repeat(28)
    const tx = {
      inputs: [
        {utxo: {receiver: 'payment-key'}},
        {utxo: {receiver: 'payment-script'}},
      ],
      certificates: [],
      withdrawals: [{rewardAddress: 'reward-key'}],
      options: {mints: []},
    } as any

    await expect(getRequiredSignersFromTransaction(tx)).resolves.toEqual([
      keyHash,
    ])
  })

  it('includes nested native-script key hashes from the CML parser', async () => {
    const inputKeyHash = 'ab'.repeat(28)
    const scriptKeyHash = 'cd'.repeat(28)
    const nativeScriptKeyHashesJson = jest.requireMock(
      '@yoroi-classic/cml-mobile-bridge',
    ).nativeScriptKeyHashesJson as jest.Mock
    nativeScriptKeyHashesJson.mockReturnValueOnce(
      JSON.stringify([scriptKeyHash, inputKeyHash, scriptKeyHash]),
    )
    const tx = {
      inputs: [{utxo: {receiver: 'payment-key'}}],
      certificates: [],
      withdrawals: [],
      options: {
        mints: [{script: {type: 'native', script: '8200'}}],
      },
    } as any

    await expect(getRequiredSignersFromTransaction(tx)).resolves.toEqual([
      inputKeyHash,
      scriptKeyHash,
    ])
    expect(nativeScriptKeyHashesJson).toHaveBeenCalledWith('8200')
  })

  describe('createWitnessState', () => {
    it('should create initial witness state', () => {
      const state = createWitnessState()

      expect(state.witnesses).toEqual([])
      expect(state.requiredSigners).toEqual([])
    })
  })

  describe('addWitness', () => {
    it('should add witness to state', () => {
      const state = createWitnessState()
      const witness = {} as any
      const newState = addWitness(state, witness, 'keyHash1')

      expect(newState.witnesses).toHaveLength(1)
      expect(newState.witnesses[0]?.signerKeyHash).toBe('keyHash1')
      expect(state.witnesses).toHaveLength(0) // Original unchanged
    })

    it('should add multiple witnesses', () => {
      const state = createWitnessState()
      const witness1 = {} as any
      const witness2 = {} as any

      const state1 = addWitness(state, witness1, 'keyHash1')
      const state2 = addWitness(state1, witness2, 'keyHash2')

      expect(state2.witnesses).toHaveLength(2)
    })
  })

  describe('isFullySigned', () => {
    it('should return true when all required signers have signed', () => {
      const state: WitnessState = {
        witnesses: [
          createMockWitness('keyHash1'),
          createMockWitness('keyHash2'),
        ],
        requiredSigners: [],
      }
      const requiredSigners = ['keyHash1', 'keyHash2']

      expect(isFullySigned(state, requiredSigners)).toBe(true)
    })

    it('should return false when some signers missing', () => {
      const state: WitnessState = {
        witnesses: [createMockWitness('keyHash1')],
        requiredSigners: [],
      }
      const requiredSigners = ['keyHash1', 'keyHash2']

      expect(isFullySigned(state, requiredSigners)).toBe(false)
    })

    it('should return true when no required signers', () => {
      const state: WitnessState = {
        witnesses: [],
        requiredSigners: [],
      }

      expect(isFullySigned(state, [])).toBe(true)
    })
  })

  describe('getMissingSigners', () => {
    it('should return missing signers', () => {
      const state: WitnessState = {
        witnesses: [createMockWitness('keyHash1')],
        requiredSigners: [],
      }
      const requiredSigners = ['keyHash1', 'keyHash2', 'keyHash3']

      const result = getMissingSigners(state, requiredSigners)

      expect(result).toEqual(['keyHash2', 'keyHash3'])
    })

    it('should return empty array when all signers present', () => {
      const state: WitnessState = {
        witnesses: [
          createMockWitness('keyHash1'),
          createMockWitness('keyHash2'),
        ],
        requiredSigners: [],
      }
      const requiredSigners = ['keyHash1', 'keyHash2']

      const result = getMissingSigners(state, requiredSigners)

      expect(result).toEqual([])
    })
  })

  describe('getWitnesses', () => {
    it('should return all witnesses', () => {
      const state: WitnessState = {
        witnesses: [
          createMockWitness('keyHash1'),
          createMockWitness('keyHash2'),
        ],
        requiredSigners: [],
      }

      const result = getWitnesses(state)

      expect(result).toHaveLength(2)
      expect(result[0]?.signerKeyHash).toBe('keyHash1')
    })

    it('should return copy of witnesses', () => {
      const state: WitnessState = {
        witnesses: [createMockWitness('keyHash1')],
        requiredSigners: [],
      }

      const result = getWitnesses(state)
      result.push(createMockWitness('keyHash2'))

      expect(state.witnesses).toHaveLength(1) // Original unchanged
    })
  })

  describe('clearWitnesses', () => {
    it('should clear all witnesses', () => {
      const state: WitnessState = {
        witnesses: [
          createMockWitness('keyHash1'),
          createMockWitness('keyHash2'),
        ],
        requiredSigners: ['keyHash1'],
      }

      const newState = clearWitnesses(state)

      expect(newState.witnesses).toEqual([])
      expect(newState.requiredSigners).toEqual(['keyHash1']) // Unchanged
    })
  })

  describe('setRequiredSigners', () => {
    it('should set required signers', () => {
      const state: WitnessState = {
        witnesses: [],
        requiredSigners: [],
      }

      const newState = setRequiredSigners(state, ['keyHash1', 'keyHash2'])

      expect(newState.requiredSigners).toEqual(['keyHash1', 'keyHash2'])
    })
  })

  describe('getRequiredSigners', () => {
    it('should return required signers from state', () => {
      const state: WitnessState = {
        witnesses: [],
        requiredSigners: ['keyHash1', 'keyHash2'],
      }

      const {getRequiredSigners} = require('./multiparty')
      const result = getRequiredSigners(state)

      expect(result).toEqual(['keyHash1', 'keyHash2'])
    })
  })
})
