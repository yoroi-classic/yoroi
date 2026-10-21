import {CIP30TransactionError as SharedCIP30TransactionError} from '@yoroi/types'

import {CIP30TransactionError, validateTransactionCbor} from './validation'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  transactionValidationInfoJson: jest.fn(() =>
    JSON.stringify({inputsCount: 1, outputsCount: 1, fee: '1000000', ttl: 10}),
  ),
}))

describe('CIP-30 validation', () => {
  it('rejects invalid hex without calling the native parser', () => {
    const {transactionValidationInfoJson} = jest.requireMock(
      '@yoroi-classic/cml-mobile-bridge',
    )
    const result = validateTransactionCbor('invalid-hex!')
    expect(result).toEqual({
      valid: false,
      errors: ['Transaction CBOR must be valid hex string'],
      warnings: [],
    })
    expect(transactionValidationInfoJson).not.toHaveBeenCalled()
  })

  it('maps parsed CML validation fields to existing warnings and errors', () => {
    const {transactionValidationInfoJson} = jest.requireMock(
      '@yoroi-classic/cml-mobile-bridge',
    )
    transactionValidationInfoJson.mockReturnValueOnce(
      JSON.stringify({inputsCount: 0, outputsCount: 0, fee: '0', ttl: null}),
    )
    expect(validateTransactionCbor('00')).toEqual({
      valid: false,
      errors: ['Transaction has no inputs'],
      warnings: [
        'Transaction has no outputs',
        'Transaction fee is zero',
        'Transaction TTL is not set',
      ],
    })
  })

  it('rejects parser errors as a failed transaction parse', () => {
    const {transactionValidationInfoJson} = jest.requireMock(
      '@yoroi-classic/cml-mobile-bridge',
    )
    transactionValidationInfoJson.mockImplementationOnce(() => {
      throw new Error('invalid transaction CBOR')
    })
    expect(validateTransactionCbor('abcdef').errors).toEqual([
      'Failed to parse transaction: invalid transaction CBOR',
    ])
  })

  it('accepts a transaction with inputs, outputs, fee, and TTL', () => {
    expect(validateTransactionCbor('abcdef')).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    })
  })

  it('creates a typed transaction error', () => {
    const validation = {valid: false, errors: ['Error 1'], warnings: []}
    const error = new CIP30TransactionError('Test error', validation)
    expect(error.message).toBe('Test error')
    expect(error.name).toBe('CIP30TransactionError')
    expect(error.validation).toBe(validation)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(SharedCIP30TransactionError)
  })
})
