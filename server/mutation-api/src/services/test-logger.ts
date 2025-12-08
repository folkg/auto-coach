/**
 * Test logger for capturing and asserting log entries in tests.
 */
import type { FiberId } from "effect";

import { Cause, Chunk, HashMap, Layer, List, Logger, LogLevel } from "effect";

/**
 * A captured log entry for test assertions.
 */
export interface CapturedLogEntry {
  readonly level: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly fiberId: string;
  readonly annotations: Record<string, unknown>;
  readonly spans: readonly string[];
  readonly cause?: {
    readonly failures: readonly unknown[];
    readonly defects: readonly unknown[];
  };
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

/**
 * Creates a test logger that captures log entries for assertions.
 */
export function createTestLogger(): {
  readonly logger: Logger.Logger<unknown, void>;
  readonly entries: CapturedLogEntry[];
  readonly clear: () => void;
  readonly getByLevel: (level: string) => readonly CapturedLogEntry[];
  readonly getByAnnotation: (key: string, value: unknown) => readonly CapturedLogEntry[];
  readonly findByMessage: (substring: string) => CapturedLogEntry | undefined;
} {
  const entries: CapturedLogEntry[] = [];

  const logger = Logger.make<unknown, void>(
    ({ annotations, cause, date, fiberId, logLevel, message, spans }) => {
      const annotationRecord: Record<string, unknown> = {};
      if (HashMap.size(annotations) > 0) {
        for (const [key, value] of annotations) {
          annotationRecord[key] = value;
        }
      }

      const spanNames: string[] = [];
      if (List.isCons(spans)) {
        for (const span of List.toArray(spans)) {
          spanNames.push(span.label);
        }
      }

      const failures = Cause.failures(cause);
      const defects = Cause.defects(cause);

      const entry: CapturedLogEntry = {
        level: logLevel._tag,
        message: formatMessage(message),
        timestamp: date,
        fiberId: formatFiberId(fiberId),
        annotations: annotationRecord,
        spans: spanNames,
      };

      if (!Chunk.isEmpty(failures) || !Chunk.isEmpty(defects)) {
        (entry as { cause?: CapturedLogEntry["cause"] }).cause = {
          failures: Chunk.toArray(failures),
          defects: Chunk.toArray(defects),
        };
      }

      entries.push(entry);
    },
  );

  return {
    logger,
    entries,
    clear: () => {
      entries.length = 0;
    },
    getByLevel: (level: string) => entries.filter((e) => e.level === level),
    getByAnnotation: (key: string, value: unknown) =>
      entries.filter((e) => e.annotations[key] === value),
    findByMessage: (substring: string) => entries.find((e) => e.message.includes(substring)),
  };
}

/**
 * Creates a Layer that provides a test logger.
 */
export function createTestLoggerLayer(): {
  readonly layer: Layer.Layer<never>;
  readonly entries: CapturedLogEntry[];
  readonly clear: () => void;
  readonly getByLevel: (level: string) => readonly CapturedLogEntry[];
  readonly getByAnnotation: (key: string, value: unknown) => readonly CapturedLogEntry[];
  readonly findByMessage: (substring: string) => CapturedLogEntry | undefined;
} {
  const testLogger = createTestLogger();

  return {
    layer: Layer.merge(
      Logger.replace(Logger.defaultLogger, testLogger.logger),
      Logger.minimumLogLevel(LogLevel.All),
    ),
    entries: testLogger.entries,
    clear: testLogger.clear,
    getByLevel: testLogger.getByLevel,
    getByAnnotation: testLogger.getByAnnotation,
    findByMessage: testLogger.findByMessage,
  };
}
