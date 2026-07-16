import {Fetcher} from '@yoroi/common'
import {Branded} from '@yoroi/types'

import {cardanoWalletBackendV1Maker} from './api-maker'

describe('cardanoWalletBackendV1Maker', () => {
  const first = Branded.asAddress('addr_test1_first')
  const second = Branded.asAddress('addr_test1_second')

  it('maps the filter-used contract without configuring a production host', async () => {
    const request: Fetcher = jest.fn().mockResolvedValue([second])
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl: 'http://127.0.0.1:3000/'},
      request,
    })

    await expect(api.filterUsedAddresses([first, second])).resolves.toEqual([
      second,
    ])
    expect(request).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:3000/v1/addresses/filter-used',
      data: {addresses: [first, second]},
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
    })
  })

  it('preserves input order and removes duplicate response entries', async () => {
    const request: Fetcher = jest
      .fn()
      .mockResolvedValue([second, first, second])
    const api = cardanoWalletBackendV1Maker({
      config: {baseUrl: 'http://localhost:3000'},
      request,
    })

    await expect(api.filterUsedAddresses([first, second])).resolves.toEqual([
      first,
      second,
    ])
  })

  it.each([null, {}, [42], ['not-requested']])(
    'rejects a response outside the backend contract: %p',
    async (response) => {
      const request: Fetcher = jest.fn().mockResolvedValue(response)
      const api = cardanoWalletBackendV1Maker({
        config: {baseUrl: 'http://localhost:3000'},
        request,
      })

      await expect(api.filterUsedAddresses([first])).rejects.toThrow(
        'Invalid cardano-wallet-backend filter-used response',
      )
    },
  )

  it.each([[[]], [Array.from({length: 1001}, () => first)]])(
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

  it('requires the caller to opt in with an explicit base URL', () => {
    expect(() =>
      cardanoWalletBackendV1Maker({
        config: {baseUrl: ''},
        request: jest.fn(),
      }),
    ).toThrow('cardano-wallet-backend /v1 base URL is required')
  })
})
