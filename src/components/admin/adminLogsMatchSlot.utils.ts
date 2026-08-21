function isTemporaryScheduledSlot(value: unknown): boolean {
  const parsedValue =
    typeof value == "number"
      ? value
      : typeof value == "string"
        ? Number(value)
        : null;

  return parsedValue != null && Number.isFinite(parsedValue) && parsedValue >= 1000;
}

export function shouldRenderMatchScheduleChange(
  fieldName: string,
  nextValue: unknown,
): boolean {
  if (fieldName == "queue_position") return false;

  return fieldName != "scheduled_slot" || !isTemporaryScheduledSlot(nextValue);
}
