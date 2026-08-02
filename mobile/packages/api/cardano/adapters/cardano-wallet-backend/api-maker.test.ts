import {Fetcher} from '@yoroi/common'
import {Branded} from '@yoroi/types'
import type {TransactionCborBase64} from '@yoroi/types'

import * as bech32 from 'bech32'

import {
  canUseCardanoWalletBackendV1FilterUsed,
  cardanoWalletBackendV1Maker,
} from './api-maker'

describe('cardanoWalletBackendV1Maker', () => {
  const signedTx = Branded.asTransactionCborBase64(
    Buffer.from('84a100818258208f', 'hex').toString('base64'),
  )
  const txHash = 'a'.repeat(64)
  const mainnet = Branded.asAddress(
    'addr1qxxvt9rzpdxxysmqp50d7f5a3gdescgrejsu7zsdxqjy8yun4cngaq46gr8c9qyz4td9ddajzqhjnrqvfh0gspzv9xnsmq6nqx',
  )
  const testnet = Branded.asAddress(
    'addr_test1qrg0x4sx2wfd3l26zqs658u8vyg8qz4dzqw0zke45lpy0vkr3y3kdut55a40jff00qmg74686vz44v6k363md06qkq0qzplc3l',
  )
  const byron = Branded.asAddress(
    'Ae2tdPwUPEZ6ipzynAWN6atmb9LNqEogput2NrMD3Z8UL7phtQLDhrKt1bf',
  )
  const byronWithInvalidChecksum = Branded.asAddress(
    'Ae2tdPwUPEZ6ipzynAWN6atmb9LNqEogput2NrMD3Z8UL7phtQLDhrKt1bg',
  )
  const rewardAddress = Branded.asAddress(
    'stake1uxf6uf5ws2aypnuzszp24kjkk7epqtef3sxymh5gq3xznfcg5w4sq',
  )
  const rewardHeaderWithPaymentPrefix = Branded.asAddress(
    'addr1uxf6uf5ws2aypnuzszp24kjkk7epqtef3sxymh5gq3xznfcwvcnsj',
  )
  const malformedShelleyWithValidChecksum = Branded.asAddress(
    bech32.encode('addr', bech32.toWords(new Uint8Array([0x01])), 1023),
  )
  const mainnetPayloadWithTestnetPrefix = Branded.asAddress(
    bech32.encode('addr_test', bech32.decode(mainnet, 1023).words, 1023),
  )
  const testnetPayloadWithMainnetPrefix = Branded.asAddress(
    bech32.encode('addr', bech32.decode(testnet, 1023).words, 1023),
  )

  it('maps the filter-used contract without configuring a production host', async () => {
    const request: Fetcher = jest.fn().mockResolvedValue([testnet])
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl: 'http://127.0.0.1:3000/'},
      request,
    })

    await expect(api.filterUsedAddresses([mainnet, testnet])).resolves.toEqual([
      testnet,
    ])
    expect(request).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:3000/v1/addresses/filter-used',
      data: {addresses: [mainnet, testnet]},
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
    })
  })

  it('preserves input order and removes duplicate response entries', async () => {
    const request: Fetcher = jest
      .fn()
      .mockResolvedValue([testnet, mainnet, testnet])
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl: 'http://localhost:3000'},
      request,
    })

    await expect(api.filterUsedAddresses([mainnet, testnet])).resolves.toEqual([
      mainnet,
      testnet,
    ])
  })

  it('submits base64 transaction CBOR as exact hex once', async () => {
    const request: Fetcher = jest
      .fn()
      .mockResolvedValueOnce({network: 'preprod', chain: 'ok'})
      .mockResolvedValueOnce({txHash})
    const api = cardanoWalletBackendV1Maker({
      config: {
        baseUrl: 'http://localhost:3000/',
        submitExpectedNetwork: 'preprod',
      },
      request,
    })

    await expect(api.submitTransaction(signedTx)).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(1, {
      url: 'http://localhost:3000/v1/status',
      method: 'GET',
      headers: {Accept: 'application/json'},
    })
    expect(request).toHaveBeenCalledWith({
      url: 'http://localhost:3000/v1/tx/submit',
      data: {cbor: '84a100818258208f'},
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
    })
  })

  it.each([
    null,
    {},
    {txHash: ''},
    {txHash: 'a'.repeat(63)},
    {txHash: 'g'.repeat(64)},
    {txHash, unexpected: true},
  ])(
    'rejects an invalid transaction submission response: %p',
    async (response) => {
      const request: Fetcher = jest
        .fn()
        .mockResolvedValueOnce({network: 'mainnet'})
        .mockResolvedValueOnce(response)
      const api = cardanoWalletBackendV1Maker({
        config: {
          baseUrl: 'http://localhost:3000',
          submitExpectedNetwork: 'mainnet',
        },
        request,
      })

      await expect(api.submitTransaction(signedTx)).rejects.toThrow(
        'Invalid cardano-wallet-backend transaction submission response',
      )
      expect(request).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['', 'not base64', 'AAAA=', '===='])(
    'rejects invalid transaction CBOR before making a request: %p',
    async (value) => {
      const request: Fetcher = jest.fn()
      const api = cardanoWalletBackendV1Maker({
        config: {baseUrl: 'http://localhost:3000'},
        request,
      })

      await expect(
        api.submitTransaction(value as TransactionCborBase64),
      ).rejects.toThrow('Invalid base64 transaction CBOR')
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('does not retry a failed transaction submission', async () => {
    const request: Fetcher = jest
      .fn()
      .mockResolvedValueOnce({network: 'preprod'})
      .mockRejectedValue(new Error('backend unavailable'))
    const api = cardanoWalletBackendV1Maker({
      config: {
        baseUrl: 'http://localhost:3000',
        submitExpectedNetwork: 'preprod',
      },
      request,
    })

    await expect(api.submitTransaction(signedTx)).rejects.toThrow(
      'backend unavailable',
    )
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each([null, {}, {network: 'unknown'}])(
    'rejects an invalid status response before submission: %p',
    async (response) => {
      const request: Fetcher = jest.fn().mockResolvedValue(response)
      const api = cardanoWalletBackendV1Maker({
        config: {
          baseUrl: 'http://localhost:3000',
          submitExpectedNetwork: 'mainnet',
        },
        request,
      })

      await expect(api.submitTransaction(signedTx)).rejects.toThrow(
        'Invalid cardano-wallet-backend status response',
      )
      expect(request).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects a backend serving a different network before submission', async () => {
    const request: Fetcher = jest
      .fn()
      .mockResolvedValue({network: 'mainnet', chain: 'ok'})
    const api = cardanoWalletBackendV1Maker({
      config: {
        baseUrl: 'http://localhost:3000',
        submitExpectedNetwork: 'preprod',
      },
      request,
    })

    await expect(api.submitTransaction(signedTx)).rejects.toThrow(
      'cardano-wallet-backend network mismatch',
    )
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('requires an expected network before checking backend status', async () => {
    const request: Fetcher = jest.fn()
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl: 'http://localhost:3000'},
      request,
    })

    await expect(api.submitTransaction(signedTx)).rejects.toThrow(
      'cardano-wallet-backend submit network is not configured',
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('maps Byron and mixed Shelley/Byron discovery batches', async () => {
    const request: Fetcher = jest.fn().mockResolvedValue([byron])
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl: 'http://localhost:3000'},
      request,
    })

    expect(canUseCardanoWalletBackendV1FilterUsed([mainnet, byron])).toBe(true)
    await expect(api.filterUsedAddresses([mainnet, byron])).resolves.toEqual([
      byron,
    ])
    expect(request).toHaveBeenCalledWith({
      url: 'http://localhost:3000/v1/addresses/filter-used',
      data: {addresses: [mainnet, byron]},
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
    })
  })

  it.each([null, {}, [42], ['not-requested']])(
    'rejects a response outside the backend contract: %p',
    async (response) => {
      const request: Fetcher = jest.fn().mockResolvedValue(response)
      const api = cardanoWalletBackendV1Maker({
        config: {baseUrl: 'http://localhost:3000'},
        request,
      })

      await expect(api.filterUsedAddresses([mainnet])).rejects.toThrow(
        'Invalid cardano-wallet-backend filter-used response',
      )
    },
  )

  it.each([[[]], [Array.from({length: 1001}, () => mainnet)]])(
    'rejects request sizes outside the backend contract',
    async (addresses) => {
      const request: Fetcher = jest.fn()
      const api = cardanoWalletBackendV1Maker({
        config: {baseUrl: 'http://localhost:3000'},
        request,
      })

      await expect(api.filterUsedAddresses(addresses)).rejects.toThrow(
        'filter-used requires between 1 and 1000 addresses',
      )
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['malformed bech32', [Branded.asAddress('addr_test1_not_real')]],
    ['invalid bech32 padding', [Branded.asAddress('addr1qps5c0s')]],
    [
      'malformed Shelley payload with a valid checksum',
      [malformedShelleyWithValidChecksum],
    ],
    [
      'mainnet payload with a testnet prefix',
      [mainnetPayloadWithTestnetPrefix],
    ],
    [
      'testnet payload with a mainnet prefix',
      [testnetPayloadWithMainnetPrefix],
    ],
    ['malformed Base58', [Branded.asAddress('Ae2tdPwUPEZ6ip0')]],
    ['Byron address with an invalid checksum', [byronWithInvalidChecksum]],
    ['reward address', [rewardAddress]],
    ['reward header with payment prefix', [rewardHeaderWithPaymentPrefix]],
  ])(
    'rejects a %s batch before calling the backend',
    async (_description, addresses) => {
      const request: Fetcher = jest.fn()
      const api = cardanoWalletBackendV1Maker({
        config: {baseUrl: 'http://localhost:3000'},
        request,
      })

      expect(canUseCardanoWalletBackendV1FilterUsed(addresses)).toBe(false)
      await expect(api.filterUsedAddresses(addresses)).rejects.toThrow(
        'requires valid Shelley or Byron payment addresses',
      )
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('marks real Shelley and Byron vectors as eligible', () => {
    expect(
      canUseCardanoWalletBackendV1FilterUsed([mainnet, testnet, byron]),
    ).toBe(true)
  })

  it('requires the caller to opt in with an explicit base URL', () => {
    expect(() =>
      cardanoWalletBackendV1Maker({
        config: {baseUrl: ''},
        request: jest.fn(),
      }),
    ).toThrow('cardano-wallet-backend /v1 base URL is required')
  })
})
