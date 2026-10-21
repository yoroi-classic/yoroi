import {formatMetadata} from './useFormattedMetadata'

describe('formatMetadata', () => {
  it('uses CML-decoded metadata and auxiliary scripts without a CSL runtime', () => {
    const result = formatMetadata('00', {
      auxiliary_data_hash: 'abc123',
      cmlReviewInfo: {
        transactionIdHex: '00',
        isValid: true,
        body: {} as never,
        witnessSet: {} as never,
        auxiliaryData: {
          cborHex: 'a0',
          metadata: [
            {
              label: '674',
              json: {msg: ['hello ', 'Cardano']},
              basicConversionsJson: '{"msg":["hello ","Cardano"]}',
              cmlJson: null,
            },
            {
              label: '42',
              json: {large: 9007199254740993},
              basicConversionsJson: '{"large":9007199254740993}',
              cmlJson: null,
            },
          ],
          nativeScripts: [{hashHex: '11', cborHex: '8200'}],
          plutusScripts: [
            {
              type: 'plutusV3',
              hashHex: '22',
              bytesHex: '01',
              cborHex: '43010101',
            },
          ],
          cmlJson: null,
        },
      },
    } as never)

    expect(result.hash).toBe('abc123')
    expect(result.metadata).toEqual({msg: ['hello Cardano']})
    expect(result.allLabels).toEqual({
      '674': {msg: ['hello ', 'Cardano']},
      '42': {large: '9007199254740993'},
    })
    expect(result.scripts).toEqual([
      {scriptHash: '11', scriptBytes: '8200'},
      {scriptHash: '22', scriptBytes: '43010101'},
    ])
  })

  it('returns no auxiliary display data when the transaction has no auxiliary hash', () => {
    expect(
      formatMetadata('00', {
        auxiliary_data_hash: null,
        cmlReviewInfo: undefined,
      } as never),
    ).toEqual({hash: null, metadata: null, allLabels: null, scripts: null})
  })
})
