import {Fetcher} from '@yoroi/common'
import {Branded} from '@yoroi/types'

import {
  canUseCardanoWalletBackendV1FilterUsed,
  cardanoWalletBackendV1Maker,
} from './api-maker'

describe('cardanoWalletBackendV1Maker', () => {
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
