export const isMidnightAirdropAvailable = (
  remotelyEnabled: boolean | undefined,
  cardanoWalletBackendUrl: string | undefined,
) =>
  Boolean(
    remotelyEnabled &&
      cardanoWalletBackendUrl?.trim() &&
      process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES ===
        'true',
  )
