import {Branded} from '@yoroi/types'

import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'

import {filterUsedAddresses} from './api'

const mockAxios = new MockAdapter(axios)
const previousBackendUrl = process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_URL

describe('cardano wallet API address filtering', () => {
  afterEach(() => {
    mockAxios.reset()
    if (previousBackendUrl == null) {
      delete process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_URL
    } else {
      process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_URL = previousBackendUrl
    }
  })

  it('uses the supplied wallet network and calls the backend filter-used route', async () => {
    const backendUrl = 'http://127.0.0.1:39001'
    const baseApiUrl = 'http://127.0.0.1:39001/api'
    const address = Branded.asAddress(
      'addr1qxxvt9rzpdxxysmqp50d7f5a3gdescgrejsu7zsdxqjy8yun4cngaq46gr8c9qyz4td9ddajzqhjnrqvfh0gspzv9xnsmq6nqx',
    )
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_URL = backendUrl
    mockAxios.onGet(`${backendUrl}/v1/status`).reply(200, {network: 'mainnet'})
    mockAxios
      .onPost(`${backendUrl}/v1/addresses/filter-used`, {addresses: [address]})
      .reply(200, [address])

    await expect(
      filterUsedAddresses([address], baseApiUrl, undefined, 'mainnet'),
    ).resolves.toEqual([address])

    expect(mockAxios.history.get).toHaveLength(1)
    expect(mockAxios.history.get[0]?.url).toBe(`${backendUrl}/v1/status`)
    expect(mockAxios.history.post).toHaveLength(1)
    expect(mockAxios.history.post[0]?.url).toBe(
      `${backendUrl}/v1/addresses/filter-used`,
    )
  })
})
