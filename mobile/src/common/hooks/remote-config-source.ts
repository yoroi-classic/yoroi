const yoroiConfigBaseUrl =
  'https://raw.githubusercontent.com/yoroi-classic/yoroi-config/refs/heads/main'

export const getRemoteConfigUrl = ({
  cardanoWalletBackendUrl,
  isDev,
}: {
  cardanoWalletBackendUrl: string | undefined
  isDev: boolean
}) => {
  const backendBaseUrl = cardanoWalletBackendUrl?.trim().replace(/\/+$/, '')

  if (backendBaseUrl) {
    return `${backendBaseUrl}/v1/config`
  }

  return `${yoroiConfigBaseUrl}/${isDev ? 'dev.json' : 'prod.json'}`
}

export const getRemoteConfigQueryKey = ({
  persistPrefixKeyword,
  url,
}: {
  persistPrefixKeyword: string
  url: string
}) => [persistPrefixKeyword, 'yoroi-config', url] as const
