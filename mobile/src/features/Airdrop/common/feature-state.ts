export const isMidnightAirdropAvailable = (
  remotelyEnabled: boolean | undefined,
  cardanoWalletBackendUrl: string | undefined,
) => Boolean(remotelyEnabled && cardanoWalletBackendUrl?.trim())
