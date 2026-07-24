import {
  getRemoteConfigQueryKey,
  getRemoteConfigUrl,
} from './remote-config-source'

describe('getRemoteConfigUrl', () => {
  it.each([
    'https://wallet-backend.example.com',
    'https://wallet-backend.example.com/',
    'https://wallet-backend.example.com///',
  ])('normalizes the backend base URL %s', (cardanoWalletBackendUrl) => {
    expect(getRemoteConfigUrl({cardanoWalletBackendUrl, isDev: false})).toEqual(
      'https://wallet-backend.example.com/v1/config',
    )
  })

  it('uses the backend source independently of the app environment', () => {
    const cardanoWalletBackendUrl = 'https://wallet-backend.example.com'

    expect(getRemoteConfigUrl({cardanoWalletBackendUrl, isDev: true})).toEqual(
      getRemoteConfigUrl({cardanoWalletBackendUrl, isDev: false}),
    )
  })

  it.each([
    [true, 'dev.json'],
    [false, 'prod.json'],
  ])(
    'uses the owned %s fallback when no backend is configured',
    (isDev, filename) => {
      expect(
        getRemoteConfigUrl({
          cardanoWalletBackendUrl: undefined,
          isDev,
        }),
      ).toEqual(
        `https://raw.githubusercontent.com/yoroi-classic/yoroi-config/refs/heads/main/${filename}`,
      )
    },
  )

  it.each(['', '   ', '///'])(
    'uses the owned fallback for an empty backend URL %j',
    (cardanoWalletBackendUrl) => {
      expect(
        getRemoteConfigUrl({cardanoWalletBackendUrl, isDev: false}),
      ).toEqual(
        'https://raw.githubusercontent.com/yoroi-classic/yoroi-config/refs/heads/main/prod.json',
      )
    },
  )
})

describe('getRemoteConfigQueryKey', () => {
  it('isolates cached config by its resolved source URL', () => {
    const githubUrl = getRemoteConfigUrl({
      cardanoWalletBackendUrl: undefined,
      isDev: false,
    })
    const backendUrl = getRemoteConfigUrl({
      cardanoWalletBackendUrl: 'https://wallet-backend.example.com',
      isDev: false,
    })

    expect(
      getRemoteConfigQueryKey({
        persistPrefixKeyword: 'wallet',
        url: githubUrl,
      }),
    ).not.toEqual(
      getRemoteConfigQueryKey({
        persistPrefixKeyword: 'wallet',
        url: backendUrl,
      }),
    )
  })
})
