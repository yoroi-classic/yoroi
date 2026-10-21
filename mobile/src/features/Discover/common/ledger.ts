import {CardanoAddressedUtxo} from '@yoroi/tx'

import {
  AddressType,
  AssetGroup,
  CertificateType,
  CredentialParamsType,
  DRepParams,
  DRepParamsType,
  Datum,
  DatumType,
  Certificate as LedgerCertificate,
  RequiredSigner,
  SignTransactionRequest,
  Token,
  TransactionSigningMode,
  TxAuxiliaryData,
  TxAuxiliaryDataType,
  TxInput,
  TxOutput,
  TxOutputDestination,
  TxOutputDestinationType,
  TxOutputFormat,
  TxRequiredSignerType,
  Withdrawal,
} from '@cardano-foundation/ledgerjs-hw-app-cardano'
import {transactionReviewInfoJson} from '@yoroi-classic/cml-mobile-bridge'
import {decode} from 'cbor2'

type AddressMap = {[addressHex: string]: Array<number>}
type JsonMap = Map<unknown, unknown>
type CmlReviewInput = {transactionIdHex: string; index: string}
type CmlReviewOutput = {
  address: string | null
  addressHex: string
  lovelace: string
  assets: Array<{policyIdHex: string; assetNameHex: string; quantity: string}>
  datum:
    | {kind: 'hash'; hashHex: string}
    | {kind: 'inline'; cborHex: string}
    | null
  scriptRef: {cborHex: string} | null
  cborHex: string
}
type CmlLedgerReviewInfo = {
  body: {
    inputs: CmlReviewInput[]
    outputs: CmlReviewOutput[]
    fee: string
    ttl: string | null
    validityIntervalStart: string | null
    certificates: unknown[] | null
    withdrawals: Array<{rewardAddressHex: string; amount: string}> | null
    mint: unknown
    scriptDataHashHex: string | null
    auxiliaryDataHashHex?: string | null
    collateralInputs: CmlReviewInput[] | null
    requiredSigners: string[] | null
    collateralReturn: CmlReviewOutput | null
    totalCollateral: string | null
    referenceInputs: CmlReviewInput[] | null
    networkId: string | null
  }
}

const cborMap = (value: unknown): JsonMap => {
  if (!(value instanceof Map))
    throw new Error('Invalid CBOR map in transaction')
  return value
}

const cborArray = (value: unknown, label: string): unknown[] => {
  if (Array.isArray(value)) return value
  if (value instanceof Set) return [...value]
  if (
    value instanceof Map &&
    [...value.keys()].every((key) => typeof key === 'number')
  )
    return [...value.values()]
  throw new Error(`Invalid ${label} in transaction CBOR`)
}

const hexBytes = (value: unknown, label: string): string => {
  if (!(value instanceof Uint8Array)) throw new Error(`Invalid ${label} bytes`)
  return Buffer.from(value).toString('hex')
}

const transactionBodyFromCbor = (cbor: string): JsonMap => {
  const decoded = decode(Buffer.from(cbor, 'hex'))
  if (decoded instanceof Map) return cborMap(decoded)
  const transaction = cborArray(decoded, 'transaction')
  return cborMap(transaction[0])
}

const cmlInfoFromCbor = (cbor: string): CmlLedgerReviewInfo =>
  JSON.parse(transactionReviewInfoJson(cbor)) as CmlLedgerReviewInfo

const transactionSetTagState = (body: JsonMap): boolean => {
  // Ledger's legacy compatibility option applies to the ledger's set-valued
  // fields, not to output/certificate arrays or map-valued withdrawals.
  const setFields = [0, 13, 14, 18]
    .filter((key) => body.has(key))
    .map((key) => body.get(key))
  const tagged = setFields.map((value) => value instanceof Set)
  if (tagged.some(Boolean) && tagged.some((hasTag) => !hasTag)) {
    throw new Error('Transaction with mixed sets cannot be signed by Ledger')
  }
  return tagged.length > 0 && tagged.every(Boolean)
}

function compareCborKey(hex1: string, hex2: string): number {
  if (hex1.length !== hex2.length) return hex1.length - hex2.length
  return hex1 < hex2 ? -1 : hex1 > hex2 ? 1 : 0
}

function toLedgerTokenBundle(
  assets: CmlReviewOutput['assets'],
): Array<AssetGroup> | null {
  if (assets.length === 0) return null
  const groups = new Map<string, Array<Token>>()
  for (const {policyIdHex, assetNameHex, quantity} of assets) {
    const tokens = groups.get(policyIdHex) ?? []
    tokens.push({amount: quantity, assetNameHex})
    groups.set(policyIdHex, tokens)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareCborKey(left, right))
    .map(([policyIdHex, tokens]) => ({
      policyIdHex,
      tokens: tokens.sort((left, right) =>
        compareCborKey(left.assetNameHex, right.assetNameHex),
      ),
    }))
}

function formatInputs(
  inputs: CmlReviewInput[],
  addressedUtxos: Array<CardanoAddressedUtxo>,
): Array<TxInput> {
  return inputs.map(({transactionIdHex, index}) => {
    const outputIndex = Number(index)
    if (!Number.isSafeInteger(outputIndex) || outputIndex < 0)
      throw new Error(`Invalid transaction input index: ${index}`)
    const ownUtxo = addressedUtxos.find(
      (utxo) =>
        utxo.txHash === transactionIdHex && utxo.txIndex === outputIndex,
    )
    return {
      txHashHex: transactionIdHex,
      outputIndex,
      path: ownUtxo ? ownUtxo.addressing.path : null,
    }
  })
}

const bytesFromAddress = (addressHex: string): Uint8Array => {
  const bytes = Buffer.from(addressHex, 'hex')
  if (bytes.length === 0) throw new Error('Empty Cardano address')
  return bytes
}

const enterpriseAddressHex = (addressBytes: Uint8Array): string => {
  const kind = addressBytes[0]! >> 4
  if (kind < 0 || kind > 3 || addressBytes.length !== 57)
    throw new Error('Expected a Shelley base address')
  const paymentCredentialKind = kind & 1
  const header =
    ((paymentCredentialKind === 0 ? 6 : 7) << 4) | (addressBytes[0]! & 0x0f)
  return Buffer.concat([
    Buffer.from([header]),
    Buffer.from(addressBytes.slice(1, 29)),
  ]).toString('hex')
}

const rewardAddressHexFromBase = (addressBytes: Uint8Array): string => {
  const kind = addressBytes[0]! >> 4
  if (kind < 0 || kind > 3 || addressBytes.length !== 57)
    throw new Error('Expected a Shelley base address')
  const stakeCredentialKind = (kind >> 1) & 1
  const header =
    ((stakeCredentialKind === 0 ? 14 : 15) << 4) | (addressBytes[0]! & 0x0f)
  return Buffer.concat([
    Buffer.from([header]),
    Buffer.from(addressBytes.slice(29, 57)),
  ]).toString('hex')
}

function credentialFromAddressHex(addressHex: string): {
  type:
    | typeof CredentialParamsType.KEY_HASH
    | typeof CredentialParamsType.SCRIPT_HASH
  hashHex: string
} {
  const bytes = bytesFromAddress(addressHex)
  const kind = bytes[0]! >> 4
  if (bytes.length !== 29 || (kind !== 14 && kind !== 15))
    throw new Error('Expected a reward address')
  return {
    type:
      kind === 14
        ? CredentialParamsType.KEY_HASH
        : CredentialParamsType.SCRIPT_HASH,
    hashHex: Buffer.from(bytes.slice(1)).toString('hex'),
  }
}

function formatOutput(
  output: CmlReviewOutput,
  ownUtxoAddressMap: AddressMap,
  ownStakeAddressMap: AddressMap,
): TxOutput {
  const bytes = bytesFromAddress(output.addressHex)
  const addressType = bytes[0]! >> 4
  let destination: TxOutputDestination
  if (addressType === 8 || addressType === 4 || addressType === 5) {
    destination = {
      type: TxOutputDestinationType.THIRD_PARTY,
      params: {addressHex: output.addressHex},
    }
  } else if (addressType === 6 || addressType === 7) {
    const ownAddressPath = ownUtxoAddressMap[output.addressHex]
    destination = ownAddressPath
      ? {
          type: TxOutputDestinationType.DEVICE_OWNED,
          params: {
            type:
              addressType === 6
                ? AddressType.ENTERPRISE_KEY
                : AddressType.ENTERPRISE_SCRIPT,
            params: {spendingPath: ownAddressPath},
          },
        }
      : {
          type: TxOutputDestinationType.THIRD_PARTY,
          params: {addressHex: output.addressHex},
        }
  } else if (addressType >= 0 && addressType <= 3) {
    const paymentPath = ownUtxoAddressMap[enterpriseAddressHex(bytes)]
    if (!paymentPath) {
      destination = {
        type: TxOutputDestinationType.THIRD_PARTY,
        params: {addressHex: output.addressHex},
      }
    } else {
      const paymentIsScript = (addressType & 1) === 1
      const stakeIsScript = ((addressType >> 1) & 1) === 1
      const stakeHashHex = Buffer.from(bytes.slice(29, 57)).toString('hex')
      const ownStakePath = ownStakeAddressMap[rewardAddressHexFromBase(bytes)]
      const addressKind = ownStakePath
        ? paymentIsScript
          ? AddressType.BASE_PAYMENT_SCRIPT_STAKE_KEY
          : AddressType.BASE_PAYMENT_KEY_STAKE_KEY
        : paymentIsScript
          ? stakeIsScript
            ? AddressType.BASE_PAYMENT_SCRIPT_STAKE_SCRIPT
            : AddressType.BASE_PAYMENT_SCRIPT_STAKE_KEY
          : stakeIsScript
            ? AddressType.BASE_PAYMENT_KEY_STAKE_SCRIPT
            : AddressType.BASE_PAYMENT_KEY_STAKE_KEY
      const stakingCredential = ownStakePath
        ? {stakingPath: ownStakePath}
        : stakeIsScript
          ? {stakingScriptHashHex: stakeHashHex}
          : {stakingKeyHashHex: stakeHashHex}
      destination = {
        type: TxOutputDestinationType.DEVICE_OWNED,
        params: {
          type: addressKind,
          params: {spendingPath: paymentPath, ...stakingCredential},
        },
      }
    }
  } else {
    throw new Error('not expecting to pay to reward address')
  }

  const amount = output.lovelace
  const tokenBundle = toLedgerTokenBundle(output.assets)
  const parsedOutput = decode(Buffer.from(output.cborHex, 'hex'))
  const isMap = parsedOutput instanceof Map
  const datum: Datum | null = output.datum
    ? output.datum.kind === 'inline'
      ? {type: DatumType.INLINE, datumHex: output.datum.cborHex}
      : {type: DatumType.HASH, datumHashHex: output.datum.hashHex}
    : null
  const referenceScriptHex = output.scriptRef?.cborHex ?? null

  if (isMap || referenceScriptHex || output.datum?.kind === 'inline') {
    return {
      format: TxOutputFormat.MAP_BABBAGE,
      amount,
      destination,
      tokenBundle,
      datum,
      referenceScriptHex,
    }
  }
  return {
    format: TxOutputFormat.ARRAY_LEGACY,
    amount,
    destination,
    tokenBundle,
    datumHashHex: output.datum?.kind === 'hash' ? output.datum.hashHex : null,
  }
}

function formatLedgerCertificates(
  certificateValues: unknown,
  stakingDerivationPath: number[],
): Array<LedgerCertificate> {
  const certificates = cborArray(certificateValues, 'certificates')
  return certificates.map((value) => {
    const cert = cborArray(value, 'certificate')
    const kind = Number(cert[0])
    const credential = cborArray(cert[1], 'stake credential')
    const credentialType = Number(credential[0])
    const keyHashHex = hexBytes(credential[1], 'stake credential')
    const stakeCredential = {
      type: CredentialParamsType.KEY_PATH as const,
      keyPath: stakingDerivationPath,
    }
    if (kind === 0) {
      return {
        type: CertificateType.STAKE_REGISTRATION,
        params: {stakeCredential},
      }
    }
    if (kind === 1) {
      return {
        type: CertificateType.STAKE_DEREGISTRATION,
        params: {stakeCredential},
      }
    }
    if (kind === 2) {
      return {
        type: CertificateType.STAKE_DELEGATION,
        params: {
          stakeCredential,
          poolKeyHashHex: hexBytes(cert[2], 'pool key hash'),
        },
      }
    }
    if (kind === 9) {
      const drep = cborArray(cert[2], 'DRep')
      const drepKind = Number(drep[0])
      let dRep: DRepParams
      if (drepKind === 0) {
        dRep = {
          type: DRepParamsType.KEY_HASH,
          keyHashHex: hexBytes(drep[1], 'DRep key hash'),
        }
      } else if (drepKind === 1) {
        dRep = {
          type: DRepParamsType.SCRIPT_HASH,
          scriptHashHex: hexBytes(drep[1], 'DRep script hash'),
        }
      } else if (drepKind === 2) {
        dRep = {type: DRepParamsType.ABSTAIN}
      } else if (drepKind === 3) {
        dRep = {type: DRepParamsType.NO_CONFIDENCE}
      } else {
        throw new Error(`Unsupported vote-delegation DRep kind: ${drepKind}`)
      }
      return {
        type: CertificateType.VOTE_DELEGATION,
        params: {stakeCredential, dRep},
      }
    }
    throw new Error(
      `Ledger doesn't support certificate type ${kind} (credential ${credentialType}:${keyHashHex})`,
    )
  })
}

function formatLedgerWithdrawals(
  withdrawals: NonNullable<CmlLedgerReviewInfo['body']['withdrawals']>,
  ownStakeAddressMap: AddressMap,
): Array<Withdrawal> {
  return withdrawals.map(({rewardAddressHex, amount}) => {
    const ownPath = ownStakeAddressMap[rewardAddressHex]
    const credential = credentialFromAddressHex(rewardAddressHex)
    return {
      amount,
      stakeCredential: ownPath
        ? {type: CredentialParamsType.KEY_PATH as const, keyPath: ownPath}
        : credential.type === CredentialParamsType.KEY_HASH
          ? {
              type: CredentialParamsType.KEY_HASH as const,
              keyHashHex: credential.hashHex,
            }
          : {
              type: CredentialParamsType.SCRIPT_HASH as const,
              scriptHashHex: credential.hashHex,
            },
    }
  })
}

export async function toLedgerSignRequest(
  cbor: string,
  networkId: number,
  protocolMagic: number,
  ownUtxoAddressMap: AddressMap,
  ownStakeAddressMap: AddressMap,
  addressedUtxos: Array<CardanoAddressedUtxo>,
  additionalRequiredSigners: Array<string> = [],
  stakingDerivationPath?: number[],
): Promise<SignTransactionRequest> {
  const bodyCbor = transactionBodyFromCbor(cbor)
  const txHasSetTags = transactionSetTagState(bodyCbor)
  const review = cmlInfoFromCbor(cbor)
  const body = review.body

  const additionalWitnessPaths: number[][] = []
  const formattedRequiredSigners: RequiredSigner[] = []
  const hashHexToOwnAddressPath = (hashHex: string): number[] | undefined => {
    const enterpriseHeader = 0x60 | (networkId & 0x0f)
    const rewardHeader = 0xe0 | (networkId & 0x0f)
    const hashBytes = Buffer.from(hashHex, 'hex')
    if (hashBytes.length !== 28) throw new Error('Invalid required signer hash')
    const enterpriseAddress = Buffer.concat([
      Buffer.from([enterpriseHeader]),
      hashBytes,
    ]).toString('hex')
    const stakeAddress = Buffer.concat([
      Buffer.from([rewardHeader]),
      hashBytes,
    ]).toString('hex')
    return (
      ownUtxoAddressMap[enterpriseAddress] || ownStakeAddressMap[stakeAddress]
    )
  }

  for (const hashHex of body.requiredSigners ?? []) {
    const ownPath = hashHexToOwnAddressPath(hashHex)
    if (ownPath) {
      formattedRequiredSigners.push({
        type: TxRequiredSignerType.PATH,
        path: ownPath,
      })
      additionalWitnessPaths.push(ownPath)
    } else {
      formattedRequiredSigners.push({type: TxRequiredSignerType.HASH, hashHex})
    }
  }
  for (const hashHex of additionalRequiredSigners) {
    const ownPath = hashHexToOwnAddressPath(hashHex)
    if (ownPath) additionalWitnessPaths.push(ownPath)
  }

  const parsedBody = bodyCbor
  const certificateValues = parsedBody.get(4)
  const certificates =
    certificateValues != null && stakingDerivationPath
      ? formatLedgerCertificates(certificateValues, stakingDerivationPath)
      : null
  const withdrawals = body.withdrawals
    ? formatLedgerWithdrawals(body.withdrawals, ownStakeAddressMap)
    : null
  const mintMap = parsedBody.get(9)
  const mint: Array<AssetGroup> | null =
    mintMap instanceof Map
      ? [...mintMap.entries()]
          .map(([policy, names]) => {
            const tokenMap = cborMap(names)
            return {
              policyIdHex: hexBytes(policy, 'mint policy ID'),
              tokens: [...tokenMap.entries()]
                .map(([name, quantity]) => ({
                  assetNameHex: hexBytes(name, 'mint asset name'),
                  amount: String(quantity),
                }))
                .sort((left, right) =>
                  compareCborKey(left.assetNameHex, right.assetNameHex),
                ),
            }
          })
          .sort((left, right) =>
            compareCborKey(left.policyIdHex, right.policyIdHex),
          )
      : null

  const auxiliaryData: TxAuxiliaryData | null = body.auxiliaryDataHashHex
    ? {
        type: TxAuxiliaryDataType.ARBITRARY_HASH,
        params: {hashHex: body.auxiliaryDataHashHex},
      }
    : null
  const collateralInputs = body.collateralInputs
    ? formatInputs(body.collateralInputs, addressedUtxos)
    : null
  const referenceInputs = body.referenceInputs
    ? formatInputs(body.referenceInputs, addressedUtxos)
    : null
  const outputs = body.outputs.map((output) =>
    formatOutput(output, ownUtxoAddressMap, ownStakeAddressMap),
  )
  const collateralReturn = body.collateralReturn
    ? formatOutput(body.collateralReturn, ownUtxoAddressMap, ownStakeAddressMap)
    : null

  return {
    signingMode: collateralInputs
      ? TransactionSigningMode.PLUTUS_TRANSACTION
      : TransactionSigningMode.ORDINARY_TRANSACTION,
    tx: {
      network: {networkId, protocolMagic},
      inputs: formatInputs(body.inputs, addressedUtxos),
      outputs,
      fee: body.fee,
      ttl: body.ttl == null ? null : Number(body.ttl),
      certificates,
      withdrawals,
      auxiliaryData,
      validityIntervalStart:
        body.validityIntervalStart == null
          ? null
          : Number(body.validityIntervalStart),
      mint,
      scriptDataHashHex: body.scriptDataHashHex,
      collateralInputs,
      requiredSigners:
        formattedRequiredSigners.length > 0 ? formattedRequiredSigners : null,
      includeNetworkId: body.networkId != null,
      collateralOutput: collateralReturn,
      totalCollateral: body.totalCollateral,
      referenceInputs,
    },
    additionalWitnessPaths,
    options: {tagCborSets: txHasSetTags},
  }
}
