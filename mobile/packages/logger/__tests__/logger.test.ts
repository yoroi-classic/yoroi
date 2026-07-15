import {
  Logger,
  LoggerLevel,
  getLogger,
  noOpLogger,
  setLogger,
  throwLoggedError,
  toLoggerMetadata,
} from '..'
import type {LoggerManager} from '..'

const makeLogger = (): LoggerManager => ({
  level: LoggerLevel.Debug,
  trail: [],
  filter: null,
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  addTransport: jest.fn(() => jest.fn()),
  disable: jest.fn(),
  enable: jest.fn(),
})

describe('@yoroi/logger', () => {
  afterEach(() => {
    setLogger(noOpLogger)
  })

  it('exposes the logger namespace level constants', () => {
    expect(Logger.Level).toBe(LoggerLevel)
    expect(Logger.Level.Debug).toBe('debug')
    expect(Logger.Level.Error).toBe('error')
  })

  it('uses the no-op logger until a shared logger is set', () => {
    const logger = makeLogger()

    expect(getLogger()).toBe(noOpLogger)

    setLogger(logger)

    expect(getLogger()).toBe(logger)
  })

  it('keeps the no-op logger methods callable', () => {
    expect(() => {
      noOpLogger.debug('debug')
      noOpLogger.log('log')
      noOpLogger.info('info')
      noOpLogger.warn('warn')
      noOpLogger.error(new Error('error'))
      noOpLogger.error('error')
      noOpLogger.addTransport(() => undefined)()
      noOpLogger.disable()
      noOpLogger.enable()
    }).not.toThrow()
  })

  it('logs and rethrows existing Error instances', () => {
    const logger = makeLogger()
    const error = new Error('boom')

    expect(() => throwLoggedError(logger)(error)).toThrow(error)
    expect(logger.error).toHaveBeenCalledWith(error)
  })

  it('wraps string errors before logging and throwing', () => {
    const logger = makeLogger()

    try {
      throwLoggedError(logger)('boom')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('boom')
      expect(logger.error).toHaveBeenCalledWith(error)
    }
  })

  it('converts Error metadata values to strings', () => {
    const cause = new Error('missing metadata')
    const metadata = toLoggerMetadata({
      cause,
      origin: '@yoroi/logger',
      retryable: false,
    })

    expect(metadata).toEqual({
      cause: 'Error: missing metadata',
      origin: '@yoroi/logger',
      retryable: false,
    })
  })
})
