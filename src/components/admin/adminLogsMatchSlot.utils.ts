const TEMPORARY_SLOT_THRESHOLD = 1000;

function isTemporaryScheduledSlot(value: unknown): boolean {
  const parsedValue =
    typeof value == "number"
      ? value
      : typeof value == "string"
        ? Number(value)
        : null;

  return (
    parsedValue != null &&
    Number.isFinite(parsedValue) &&
    parsedValue >= TEMPORARY_SLOT_THRESHOLD
  );
}

export function shouldRenderMatchScheduleChange(
  fieldName: string,
  nextValue: unknown,
): boolean {
  if (fieldName == "queue_position") return false;

  return fieldName != "scheduled_slot" || !isTemporaryScheduledSlot(nextValue);
}
