/**
 * Structured JSON logger for Google Cloud Logging.
 *
 * This logger outputs JSON to stdout/stderr in a format that Google Cloud
 * (both Cloud Run and Firebase Functions) automatically parses into
 * structured log entries.
 *
 * This replaces the firebase-functions logger with a more context-rich
 * alternative that includes correlation IDs, service names, and outcome tracking.
 */

/**
 * Google Cloud Logging severity levels.
 * @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
type GCPSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

interface StructuredLogEntry {
  severity: GCPSeverity;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Log context that can be passed to logging functions.
 */
export interface LogContext {
  readonly userId?: string;
  readonly taskId?: string;
  readonly requestId?: string;
  readonly phase?: "dispatch" | "execution" | "scheduling" | "yahoo-http" | "firebase" | "email";
  readonly operation?: string;
  readonly service?: "yahoo" | "sendgrid" | "firebase" | "cloudtasks";
  readonly outcome?: "success" | "handled-error" | "unhandled-error";
  readonly terminated?: boolean;
  readonly errorCode?: string;
  readonly event?: string;
  readonly [key: string]: unknown;
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorType: error.name,
      errorMessage: error.message,
      stackTrace: error.stack,
    };
  }
  if (typeof error === "object" && error !== null) {
    return { errorDetails: error };
  }
  return { errorDetails: String(error) };
}

function createLogEntry(
  severity: GCPSeverity,
  message: string,
  context?: LogContext,
  error?: unknown,
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    severity,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) {
        entry[key] = value;
      }
    }
  }

  if (error) {
    Object.assign(entry, formatError(error));
  }

  return entry;
}

function writeLog(entry: StructuredLogEntry): void {
  const output = JSON.stringify(entry);
  if (entry.severity === "ERROR") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

/**
 * Structured logger for Google Cloud.
 */
export const structuredLogger = {
  /**
   * Log a debug message.
   */
  debug(message: string, context?: LogContext): void {
    writeLog(createLogEntry("DEBUG", message, context));
  },

  /**
   * Log an info message.
   */
  info(message: string, context?: LogContext): void {
    writeLog(createLogEntry("INFO", message, context));
  },

  /**
   * Log a warning message.
   */
  warn(message: string, context?: LogContext, error?: unknown): void {
    writeLog(createLogEntry("WARNING", message, context, error));
  },

  /**
   * Log an error message.
   */
  error(message: string, context?: LogContext, error?: unknown): void {
    writeLog(createLogEntry("ERROR", message, context, error));
  },

  /**
   * Log with explicit severity.
   */
  log(severity: GCPSeverity, message: string, context?: LogContext, error?: unknown): void {
    writeLog(createLogEntry(severity, message, context, error));
  },
};

/**
 * Create a child logger with preset context.
 * Useful for adding userId, taskId, etc. once and having them on all subsequent logs.
 */
export function createChildLogger(baseContext: LogContext): typeof structuredLogger {
  return {
    debug(message: string, context?: LogContext): void {
      writeLog(createLogEntry("DEBUG", message, { ...baseContext, ...context }));
    },
    info(message: string, context?: LogContext): void {
      writeLog(createLogEntry("INFO", message, { ...baseContext, ...context }));
    },
    warn(message: string, context?: LogContext, error?: unknown): void {
      writeLog(createLogEntry("WARNING", message, { ...baseContext, ...context }, error));
    },
    error(message: string, context?: LogContext, error?: unknown): void {
      writeLog(createLogEntry("ERROR", message, { ...baseContext, ...context }, error));
    },
    log(severity: GCPSeverity, message: string, context?: LogContext, error?: unknown): void {
      writeLog(createLogEntry(severity, message, { ...baseContext, ...context }, error));
    },
  };
}

export default structuredLogger;
