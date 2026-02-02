import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { LOGGING } from '../config/constants.js';
import { settings } from '../config/settings.js';

// Ensure log directory exists
if (settings.logToFile && !fs.existsSync(LOGGING.LOG_DIR)) {
  fs.mkdirSync(LOGGING.LOG_DIR, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.json()
);

// Build transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleFormat,
    level: settings.logLevel,
  }),
];

if (settings.logToFile) {
  transports.push(
    new winston.transports.File({
      filename: path.join(LOGGING.LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: LOGGING.MAX_FILE_SIZE,
      maxFiles: LOGGING.MAX_FILES,
    }),
    new winston.transports.File({
      filename: path.join(LOGGING.LOG_DIR, 'combined.log'),
      format: fileFormat,
      maxsize: LOGGING.MAX_FILE_SIZE,
      maxFiles: LOGGING.MAX_FILES,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: settings.logLevel,
  transports,
  exitOnError: false,
});

// Convenience methods with context
export function createLogger(context: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      logger.debug(`[${context}] ${message}`, meta),
    info: (message: string, meta?: Record<string, unknown>) =>
      logger.info(`[${context}] ${message}`, meta),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logger.warn(`[${context}] ${message}`, meta),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(`[${context}] ${message}`, meta),
  };
}

// Trade-specific logger
export const tradeLogger = createLogger('TRADE');

// Security-specific logger
export const securityLogger = createLogger('SECURITY');

// Blockchain-specific logger
export const blockchainLogger = createLogger('BLOCKCHAIN');

// Twitter-specific logger
export const twitterLogger = createLogger('TWITTER');
