const REDACT_KEY =
  /password|passwd|token|csrf|cookie|authorization|secret|api[-_]?key|turnstile|session|phone|telefone|whatsapp|pix|street|address|endereco|complement|neighborhood|bairro|number|numero/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACT_KEY.test(key) ? "[redacted]" : redact(item);
  }
  return output;
}

export type LogLevel = "info" | "warn" | "error" | "security";

export interface LogRecord {
  request_id: string;
  timestamp: string;
  event: string;
  level: LogLevel;
  method?: string;
  route?: string;
  status?: number;
  duration_ms?: number;
  error_code?: string;
  actor_id?: number;
  resource_id?: string;
  detail?: string;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function formatLog(record: LogRecord): string {
  return JSON.stringify(redact(record));
}

function emit(level: LogLevel, record: Omit<LogRecord, "level" | "timestamp">) {
  const line = formatLog({ ...record, level, timestamp: new Date().toISOString() });
  if (level === "error" || level === "security") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info(record: Omit<LogRecord, "level" | "timestamp">) {
    emit("info", record);
  },
  warn(record: Omit<LogRecord, "level" | "timestamp">) {
    emit("warn", record);
  },
  error(record: Omit<LogRecord, "level" | "timestamp">) {
    emit("error", record);
  },
  security(record: Omit<LogRecord, "level" | "timestamp">) {
    emit("security", record);
  },
};
