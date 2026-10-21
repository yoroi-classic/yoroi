import {BalanceQuantity} from '@yoroi/types'

import {
  calculateTxId,
  getBalanceForStakingCredentials,
  getTransactionFee,
  getTransactionWitnessSetHex,
  hashTransaction,
} from './transactions'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  transactionIdHex: jest.fn((hex: string) => `id:${hex}`),
  transactionValidationInfoJson: jest.fn(() => JSON.stringify({fee: '170000'})),
  transactionWitnessSetHex: jest.fn((hex: string) => `witnesses:${hex}`),
  stakeCredentialHexFromAddress: jest.fn(() => '8200581c' + 'ab'.repeat(28)),
}))

describe('transaction utils', () => {
  describe('hashTransaction', () => {
    it('should hash transaction bytes', async () => {
      const result = await hashTransaction(new Uint8Array([1, 2, 3]))
      expect(result).toBe('id:010203')
    })
  })

  describe('calculateTxId', () => {
    it('should calculate transaction ID from hex', async () => {
      const result = await calculateTxId('abcdef', 'hex')
      expect(result).toBe('id:abcdef')
    })

    it('should calculate transaction ID from base64', async () => {
      const result = await calculateTxId(
        Buffer.from('test').toString('base64'),
        'base64',
      )
      expect(result).toBe(`id:${Buffer.from('test').toString('hex')}`)
    })
  })

  describe('getTransactionWitnessSetHex', () => {
    it('extracts the CML witness-set bytes from the signed transaction bytes', () => {
      expect(getTransactionWitnessSetHex(new Uint8Array([1, 2, 255]))).toBe(
        'witnesses:0102ff',
      )
    })
  })

  describe('getTransactionFee', () => {
    it('reads the fee as an integer from the CML transaction parser', () => {
      expect(getTransactionFee('84a0')).toBe(170000n)
    })

    it('rejects malformed CML fee output rather than rounding', () => {
      const {transactionValidationInfoJson} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      transactionValidationInfoJson.mockReturnValueOnce(
        JSON.stringify({fee: '1.5'}),
      )
      expect(() => getTransactionFee('84a0')).toThrow(
        'Invalid CML transaction fee response',
      )
    })
  })

  describe('getBalanceForStakingCredentials', () => {
    it('should calculate balances for staking credentials', async () => {
      const utxos = [
        {
          receiver: 'addr_test1qpxxxxxx', // Valid bech32 address
          amount: '1000000' as BalanceQuantity,
        },
      ]

      const result = await getBalanceForStakingCredentials(utxos)

      expect(result).toEqual({['8200581c' + 'ab'.repeat(28)]: '1000000'})
    })

    it('should handle invalid addresses gracefully', async () => {
      const {stakeCredentialHexFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      stakeCredentialHexFromAddress.mockImplementationOnce(() => {
        throw new Error('Invalid address')
      })

      const utxos = [
        {
          receiver: 'invalid_address',
          amount: '1000000' as BalanceQuantity,
        },
      ]

      const result = await getBalanceForStakingCredentials(utxos)

      expect(result).toEqual({})
    })

    it('should skip addresses that do not start with 0-3', async () => {
      const utxos = [
        {
          receiver: '4invalid', // Starts with 4, not 0-3
          amount: '1000000' as BalanceQuantity,
        },
      ]

      const {stakeCredentialHexFromAddress} = jest.requireMock(
        '@yoroi-classic/cml-mobile-bridge',
      )
      stakeCredentialHexFromAddress.mockImplementationOnce(() => {
        throw new Error('not a base address')
      })
      const result = await getBalanceForStakingCredentials(utxos)

      expect(result).toEqual({})
    })

    it('should sum amounts for same staking credential', async () => {
      const stakeCredHex = '8200581c' + 'ab'.repeat(28)

      const utxos = [
        {
          receiver: 'addr_test1qpxxxxxx',
          amount: '1000000' as BalanceQuantity,
        },
        {
          receiver: 'addr_test1qpxxxxxx',
          amount: '2000000' as BalanceQuantity,
        },
      ]

      const result = await getBalanceForStakingCredentials(utxos)

      // Check that result contains the staking credential
      const balance = result[stakeCredHex]
      expect(balance).toBe('3000000')
    })
  })
})
