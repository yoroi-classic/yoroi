import {
  ModernUtxo,
  type TransactionMetadata,
  addInputs,
  addMetadata,
  buildRecipeTransaction,
  createCIP15VotingMetadata,
  createCIP36VotingMetadata,
  createCardanoHaskellConfig,
  createTransactionBuilder,
  normalizeAddressToHex,
  selectUtxosForAmount,
  setChangeAddress,
  setTTLWithBuffer,
} from '@yoroi/tx'
import {Address, Portfolio, Wallet} from '@yoroi/types'

import {publicKeyHexFromPrivateKeyHex} from '@yoroi-classic/cml-mobile-bridge'

export type CreateVotingRegTxParams = {
  utxos: ModernUtxo[]
  primaryTokenId: Portfolio.Token.Id
  protocolParams: {
    coinsPerUtxoByte: string
    keyDeposit: string
    linearFee: {constant: string; coefficient: string}
    poolDeposit: string
  }
  networkId: number
  getAbsoluteSlotNumber: () => Promise<BigNumber>
  getChangeAddress: (addressMode: Wallet.AddressMode) => Address | string
  stakingPublicKeyHex: string
  getFirstPaymentAddress: () => Address | string
  supportsCIP36: boolean
  catalystKeyHex: string
  addressMode: Wallet.AddressMode
}

export async function createVotingRegTx({
  utxos,
  primaryTokenId,
  protocolParams,
  networkId,
  getAbsoluteSlotNumber,
  getChangeAddress,
  stakingPublicKeyHex,
  getFirstPaymentAddress,
  supportsCIP36,
  catalystKeyHex,
  addressMode,
}: CreateVotingRegTxParams): Promise<{votingRegTx: {cbor: string}}> {
  const absSlotNumber = await getAbsoluteSlotNumber()
  const votingPublicKeyHex = publicKeyHexFromPrivateKeyHex(catalystKeyHex)
  const changeAddressRaw = getChangeAddress(addressMode)
  const changeAddress =
    typeof changeAddressRaw === 'string'
      ? (changeAddressRaw as Address)
      : changeAddressRaw

  const protocolParamsConfig = createCardanoHaskellConfig(
    protocolParams,
    networkId,
  )

  const nonce = absSlotNumber.toNumber()

  const paymentAddress = getFirstPaymentAddress()
  const paymentAddressHex = normalizeAddressToHex(paymentAddress)
  if (!paymentAddressHex) {
    throw new Error('Failed to convert payment address to hex')
  }

  const rewardAddressHex = paymentAddressHex

  // Estimate fee for voting registration transaction
  // CIP-36 metadata with hex addresses can be larger (~600-800 bytes)
  // Use a more conservative estimate to account for metadata size
  const estimatedTxSize = supportsCIP36 ? 800 : 600 // bytes - CIP-36 has larger metadata
  const estimatedFee =
    BigInt(protocolParams.linearFee.constant) +
    BigInt(protocolParams.linearFee.coefficient) * BigInt(estimatedTxSize)

  // Voting registration doesn't require deposit, but we need:
  // 1. Fee for the transaction
  // 2. Minimum UTXO value for the change output (at least 1 ADA)
  const minUtxoValue = BigInt(protocolParamsConfig.minimumUtxoVal || '1000000') // Base min UTXO (1 ADA)
  // Increase fee buffer for CIP-36 to account for larger metadata and fee calculation variance
  const feeBuffer = supportsCIP36 ? BigInt('200000') : BigInt('100000') // 0.2 ADA for CIP-36, 0.1 ADA for CIP-15
  const requiredAda = (estimatedFee + minUtxoValue + feeBuffer).toString()

  // Select only necessary UTXOs to cover fees
  const selectedUtxos = selectUtxosForAmount(utxos, requiredAda, primaryTokenId)

  // Build transaction using functional TransactionBuilder
  let builderState = createTransactionBuilder()

  // Add only selected UTXOs as inputs
  builderState = addInputs(builderState, selectedUtxos)

  // Create and add voting metadata from CML-derived raw public key bytes.
  const votingMetadata = supportsCIP36
    ? createCIP36VotingMetadata(
        votingPublicKeyHex,
        stakingPublicKeyHex,
        rewardAddressHex,
        nonce,
        paymentAddressHex,
      )
    : createCIP15VotingMetadata(
        votingPublicKeyHex,
        stakingPublicKeyHex,
        rewardAddressHex,
        nonce,
      )

  builderState = addMetadata(
    builderState,
    String(votingMetadata.label),
    votingMetadata.data as TransactionMetadata['data'],
  )

  // Set change address
  builderState = setChangeAddress(builderState, changeAddress)

  // Set TTL with buffer
  builderState = setTTLWithBuffer(builderState, absSlotNumber.toNumber())

  // Build the transaction
  const result = await buildRecipeTransaction(
    builderState,
    protocolParamsConfig,
    primaryTokenId,
  )

  return {
    votingRegTx: {cbor: result.cbor},
  }
}
