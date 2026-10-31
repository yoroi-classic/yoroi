import {Branded} from '@yoroi/types'

import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'

import {filterUsedAddresses} from './api'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({}))

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

  it('falls back to only the legacy POST when CWB reports a different network', async () => {
    const backendUrl = 'http://127.0.0.1:39002'
    const baseApiUrl = 'http://127.0.0.1:39003/api'
    const address = Branded.asAddress(
      'addr1qxxvt9rzpdxxysmqp50d7f5a3gdescgrejsu7zsdxqjy8yun4cngaq46gr8c9qyz4td9ddajzqhjnrqvfh0gspzv9xnsmq6nqx',
    )
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_URL = backendUrl
    mockAxios.onGet(`${backendUrl}/v1/status`).reply(200, {network: 'mainnet'})
    mockAxios
      .onPost(`${baseApiUrl}/v2/addresses/filterUsed`)
      .reply(200, [address])

    await expect(
      filterUsedAddresses([address], baseApiUrl, undefined, 'preprod'),
    ).resolves.toEqual([address])

    expect(mockAxios.history.get).toHaveLength(1)
    expect(mockAxios.history.get[0]?.url).toBe(`${backendUrl}/v1/status`)
    expect(mockAxios.history.post).toHaveLength(1)
    expect(mockAxios.history.post[0]?.url).toBe(
      `${baseApiUrl}/v2/addresses/filterUsed`,
    )
  })
})
