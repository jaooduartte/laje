import { AdminLogResourceTable } from "@/lib/enums";

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value == "object" && value != null && !Array.isArray(value);
}

export function resolveAdminLogRecordValue(value: unknown): Record<string, unknown> | null {
  if (isRecordValue(value)) {
    return value;
  }

  if (typeof value != "string") {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(value);
    return isRecordValue(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

export function resolveAdminLogDataRecord(
  resourceTable: string,
  value: unknown,
): Record<string, unknown> | null {
  const record = resolveAdminLogRecordValue(value);

  if (!record || resourceTable != AdminLogResourceTable.MATCHES) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).map(([fieldName, fieldValue]) => [
      fieldName.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`),
      fieldValue,
    ]),
  );
}
