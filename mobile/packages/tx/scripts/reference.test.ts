import {Address, Balance, ScriptHash, TransactionHash} from '@yoroi/types'

import {createTransactionBuilder} from '../transaction-builder/builder'
import {ModernUtxo} from '../utxo/models'
import {
  addReferenceScriptUsage,
  detectReferenceScript,
  estimateReferenceScriptFee,
  findReferenceScriptByHash,
  findReferenceScripts,
} from './reference'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  scriptHashHexFromCbor: jest.fn((type: string) =>
    type === 'native' ? 'a'.repeat(56) : 'b'.repeat(56),
  ),
}))

describe('reference scripts', () => {
  const createMockUtxo = (
    txHash = 'hash1',
    txIndex = 0,
    referenceScript?: ModernUtxo['referenceScript'],
  ): ModernUtxo => ({
    receiver: 'addr_test1' as Address,
    txHash: txHash as TransactionHash,
    txIndex,
    balance: {} as Balance.Amounts,
    referenceScript,
    toTransactionUnspentOutputHex: jest.fn(() => 'hex'),
  })

  describe('detectReferenceScript', () => {
    it('normalizes native and Plutus reference script metadata', () => {
      const native = detectReferenceScript(
        createMockUtxo('tx-native', 2, {
          hash: 'a'.repeat(56),
          type: 'native',
          size: 2,
          bytes: '0102',
        }),
      )
      const plutus = detectReferenceScript(
        createMockUtxo('tx-plutus', 3, {
          hash: 'b'.repeat(56),
          type: 'plutusV3',
          size: 2,
          bytes: 'aabb',
        }),
      )

      expect(native).toEqual({
        txHash: 'tx-native',
        txIndex: 2,
        scriptHash: 'a'.repeat(56),
        scriptType: 'native',
        scriptSize: 2,
      })
      expect(plutus).toEqual({
        txHash: 'tx-plutus',
        txIndex: 3,
        scriptHash: 'b'.repeat(56),
        scriptType: 'plutus',
        scriptSize: 2,
      })
    })

    it.each([
      undefined,
      {hash: 'bad', type: 'native', size: 1, bytes: '00'},
      {hash: 'a'.repeat(56), type: 'plutusV4', size: 1, bytes: '00'},
      {hash: 'a'.repeat(56), type: 'native', size: 2, bytes: '00'},
      {hash: 'a'.repeat(56), type: 'native', size: 1, bytes: 'xx'},
    ])('rejects missing or inconsistent metadata %#', (referenceScript) => {
      expect(
        detectReferenceScript(createMockUtxo('tx', 0, referenceScript)),
      ).toBeNull()
    })
  })

  it('finds reference scripts and looks them up by hash', () => {
    const utxos = [
      createMockUtxo('tx1', 0, {
        hash: 'a'.repeat(56),
        type: 'native',
        size: 1,
        bytes: '00',
      }),
      createMockUtxo('tx2'),
    ]

    expect(findReferenceScripts(utxos)).toHaveLength(1)
    expect(findReferenceScriptByHash(utxos, 'a'.repeat(56))?.txHash).toBe('tx1')
    expect(findReferenceScriptByHash(utxos, 'b'.repeat(56))).toBeNull()
  })

  it('rejects a reference script whose supplied hash does not match its bytes', () => {
    expect(
      detectReferenceScript(
        createMockUtxo('tx', 0, {
          hash: 'c'.repeat(56),
          type: 'native',
          size: 1,
          bytes: '00',
        }),
      ),
    ).toBeNull()
  })

  it('normalizes reference-script hashes for lookup', () => {
    const reference = createMockUtxo('tx', 0, {
      hash: 'A'.repeat(56),
      type: 'native',
      size: 2,
      bytes: '0102',
    })

    expect(detectReferenceScript(reference)?.scriptHash).toBe('a'.repeat(56))
    expect(findReferenceScriptByHash([reference], 'a'.repeat(56))?.txHash).toBe(
      'tx',
    )
  })

  describe('estimateReferenceScriptFee', () => {
    it('estimates fee with protocol params', () => {
      const result = estimateReferenceScriptFee(
        {
          minFeeReferenceScript: {
            coinsPerByte: {numerator: '1000', denominator: '10000'},
            tierStepBytes: '100',
            multiplier: '2',
          },
        },
        1000,
      )
      expect(BigInt(result)).toBeGreaterThan(0n)
    })

    it('uses fallback when protocol params are not provided', () => {
      expect(estimateReferenceScriptFee({}, 1000)).toBe('0.044')
    })
  })

  describe('addReferenceScriptUsage', () => {
    const referenceScript = {
      txHash: 'hash1' as TransactionHash,
      txIndex: 0,
      scriptHash: 'a'.repeat(56) as ScriptHash,
      scriptType: 'native' as const,
      scriptSize: 100,
    }

    it('adds a reference input to transaction state', () => {
      const state = createTransactionBuilder()
      const newState = addReferenceScriptUsage(state, referenceScript)
      expect(newState.referenceInputs).toHaveLength(1)
      expect(newState.referenceInputs[0]?.utxo.txHash).toBe('hash1')
      expect(newState.referenceInputs[0]?.utxo.txIndex).toBe(0)
    })

    it('rejects serialization of its synthetic UTXO', () => {
      const state = createTransactionBuilder()
      const newState = addReferenceScriptUsage(state, referenceScript)
      const refUtxo = newState.referenceInputs[0]?.utxo
      if (!refUtxo) throw new Error('Reference input not found')

      expect(() => refUtxo.toTransactionUnspentOutputHex()).toThrow(
        'Cannot serialize reference script UTXO',
      )
    })
  })
})
