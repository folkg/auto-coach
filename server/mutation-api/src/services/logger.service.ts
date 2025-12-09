/**
 * Effect-based structured logger for Google Cloud Logging.
 *
 * Outputs JSON to stdout/stderr in a format that Google Cloud Run
 * automatically parses into structured log entries with:
 * - severity levels (DEBUG, INFO, WARNING, ERROR)
 * - custom fields for correlation (requestId, taskId, userId, etc.)
 * - operation context (phase, operation, service)
 * - outcome tracking (success, handled-error, unhandled-error)
 */
import type { FiberId } from "effect";

import { Cause, Chunk, HashMap, Layer, List, Logger, LogLevel } from "effect";

/**
 * Google Cloud Logging severity levels.
 * @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
type GCPSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

function toGCPSeverity(level: LogLevel.LogLevel): GCPSeverity {
  switch (level._tag) {
    case "Debug":
    case "Trace":
    case "All":
      return "DEBUG";
    case "Info":
      return "INFO";
    case "Warning":
      return "WARNING";
    case "Error":
    case "Fatal":
    case "None":
      return "ERROR";
  }
}

interface StructuredLogEntry {
  severity: GCPSeverity;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function formatCause(cause: Cause.Cause<unknown>): Record<string, unknown> | undefined {
  if (Cause.isEmpty(cause)) {
    return undefined;
  }

  const failures = Cause.failures(cause);
  const defects = Cause.defects(cause);

  const result: Record<string, unknown> = {};

  if (!Chunk.isEmpty(failures)) {
    const failureList = Chunk.toArray(failures);
    if (failureList.length === 1) {
      const failure = failureList[0];
      if (failure instanceof Error) {
        result.errorType = failure.name;
        result.errorMessage = failure.message;
        if (failure.stack) {
          result.stackTrace = failure.stack;
        }
      } else if (typeof failure === "object" && failure !== null && "_tag" in failure) {
        result.errorTag = (failure as { readonly _tag: string })._tag;
        result.errorDetails = failure;
      } else {
        result.error = failure;
      }
    } else if (failureList.length > 1) {
      result.errors = failureList;
    }
  }

  if (!Chunk.isEmpty(defects)) {
    const defectList = Chunk.toArray(defects);
    if (defectList.length === 1) {
      const defect = defectList[0];
      if (defect instanceof Error) {
        result.defectType = defect.name;
        result.defectMessage = defect.message;
        if (defect.stack) {
          result.defectStackTrace = defect.stack;
        }
      } else {
        result.defect = defect;
      }
    } else if (defectList.length > 1) {
      result.defects = defectList;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function formatFiberId(fiberId: FiberId.FiberId): string {
  if (fiberId._tag === "None") {
    return "none";
  }
  if (fiberId._tag === "Runtime") {
    return `fiber-${fiberId.id}`;
  }
  if (fiberId._tag === "Composite") {
    return `composite-${formatFiberId(fiberId.left)}-${formatFiberId(fiberId.right)}`;
  }
  return "unknown";
}

/**
 * Creates a structured JSON logger for Google Cloud Logging.
 *
 * Log annotations are flattened into the log entry for easy querying:
 * - Effect.annotateLogs("userId", "abc") -> { "userId": "abc" }
 * - Effect.withLogSpan("operation") -> included in spans array
 */
export const gcpJsonLogger = Logger.make<unknown, void>(
  ({ annotations, cause, date, fiberId, logLevel, message, spans }) => {
    const entry: StructuredLogEntry = {
      severity: toGCPSeverity(logLevel),
      message: formatMessage(message),
      timestamp: date.toISOString(),
      fiberId: formatFiberId(fiberId),
    };

    // Flatten annotations into the log entry
    if (HashMap.size(annotations) > 0) {
      for (const [key, value] of annotations) {
        entry[key] = value;
      }
    }

    // Add spans if present (for tracing)
    if (List.isCons(spans)) {
      const spanNames = List.toArray(spans).map((span) => span.label);
      if (spanNames.length > 0) {
        entry.spans = spanNames;
      }
    }

    // Add cause information if present
    const causeInfo = formatCause(cause);
    if (causeInfo) {
      Object.assign(entry, causeInfo);
    }

    // Write to appropriate stream
    const output = JSON.stringify(entry);
    if (logLevel._tag === "Error" || logLevel._tag === "Fatal") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  },
);

/**
 * Layer that provides the GCP JSON logger as the default Effect logger.
 */
export const GcpLoggerLive = Logger.replace(Logger.defaultLogger, gcpJsonLogger);

/**
 * Convenience layer for production use.
 */
export const ProductionLoggerLayer = Layer.merge(
  GcpLoggerLive,
  Logger.minimumLogLevel(LogLevel.Info),
);

/**
 * Layer for development with debug logging enabled.
 */
export const DevelopmentLoggerLayer = Layer.merge(
  GcpLoggerLive,
  Logger.minimumLogLevel(LogLevel.Debug),
);
