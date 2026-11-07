// eslint-disable-next-line no-restricted-syntax -- This error type identifies the one safe fallback condition shared across API layers.
export class CardanoWalletBackendNetworkMismatchError extends Error {
  constructor() {
    super('cardano-wallet-backend network mismatch')
    this.name = 'CardanoWalletBackendNetworkMismatchError'
  }
}
