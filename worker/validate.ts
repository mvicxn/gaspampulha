export const MAX_JSON_BYTES = 8_192;

export type Field =
  | { kind: "string"; min: number; max: number }
  | { kind: "int"; min: number; max: number }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "array"; min: number; max: number; item: Field };

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function check(value: unknown, field: Field, path: string, errors: string[]): unknown {
  if (field.kind === "string") {
    if (typeof value !== "string" || value.length < field.min || value.length > field.max) {
      errors.push(`${path} tamanho inválido`);
      return value;
    }
    return value;
  }
  if (field.kind === "int") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < field.min || value > field.max) {
      errors.push(`${path} inteiro inválido`);
      return value;
    }
    return value;
  }
  if (field.kind === "enum") {
    if (typeof value !== "string" || !field.values.includes(value)) {
      errors.push(`${path} enum inválido`);
      return value;
    }
    return value;
  }
  if (!Array.isArray(value) || value.length < field.min || value.length > field.max) {
    errors.push(`${path} lista inválida`);
    return value;
  }
  return value.map((item, index) => check(item, field.item, `${path}[${index}]`, errors));
}

export function parseFields(
  input: unknown,
  fields: Record<string, Field>,
): Validation<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["corpo inválido"] };
  }
  const source = input as Record<string, unknown>;
  const errors: string[] = [];
  const extra = Object.keys(source).filter((key) => !(key in fields));
  if (extra.length > 0) errors.push(`campos inesperados: ${extra.join(",")}`);
  const value: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    value[key] = check(source[key], field, key, errors);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export const qtyField: Field = { kind: "int", min: 1, max: 20 };

export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<Validation<unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, errors: ["corpo grande"] };
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return { ok: false, errors: ["content-type inválido"] };
  }
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, errors: ["corpo grande"] };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, errors: ["json inválido"] };
  }
}
