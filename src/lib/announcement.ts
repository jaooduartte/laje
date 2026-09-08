export type AnnouncementType = "IMPROVEMENT" | "NOTICE" | "PROBLEM";

export interface AnnouncementTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface AnnouncementContent {
  version: 1;
  segments: AnnouncementTextSegment[];
}

export const DEFAULT_ANNOUNCEMENT_TYPE: AnnouncementType = "NOTICE";

export const ANNOUNCEMENT_TYPE_OPTIONS: Array<{
  value: AnnouncementType;
  label: string;
  description: string;
}> = [
  {
    value: "IMPROVEMENT",
    label: "Melhoria",
    description: "Destaca novidades e melhorias no app.",
  },
  {
    value: "NOTICE",
    label: "Aviso",
    description: "Comunica informações importantes aos usuários.",
  },
  {
    value: "PROBLEM",
    label: "Problema",
    description: "Sinaliza indisponibilidades ou situações urgentes.",
  },
];

function normalizeAnnouncementText(value: string): string {
  return value.replace(/\s+/g, " ");
}

function resolveAnnouncementSegment(value: unknown): AnnouncementTextSegment | null {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return null;
  }

  const segment = value as Record<string, unknown>;

  if (typeof segment.text != "string") {
    return null;
  }

  return {
    text: normalizeAnnouncementText(segment.text),
    ...(segment.bold === true ? { bold: true } : {}),
    ...(segment.italic === true ? { italic: true } : {}),
    ...(segment.underline === true ? { underline: true } : {}),
  };
}

function hasSameMarks(
  firstSegment: AnnouncementTextSegment,
  secondSegment: AnnouncementTextSegment,
): boolean {
  return (
    firstSegment.bold === secondSegment.bold &&
    firstSegment.italic === secondSegment.italic &&
    firstSegment.underline === secondSegment.underline
  );
}

export function normalizeAnnouncementContent(
  value: unknown,
): AnnouncementContent | null {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return null;
  }

  const content = value as Record<string, unknown>;

  if (content.version !== 1 || !Array.isArray(content.segments)) {
    return null;
  }

  const segments = content.segments.reduce<AnnouncementTextSegment[]>(
    (normalizedSegments, segmentValue) => {
      const segment = resolveAnnouncementSegment(segmentValue);

      if (!segment || segment.text.length == 0) {
        return normalizedSegments;
      }

      const previousSegment = normalizedSegments.at(-1);

      if (previousSegment && hasSameMarks(previousSegment, segment)) {
        previousSegment.text += segment.text;
      } else {
        normalizedSegments.push(segment);
      }

      return normalizedSegments;
    },
    [],
  );

  const plainText = segments.map((segment) => segment.text).join("").trim();

  while (segments.length > 0 && segments[0].text.trimStart().length == 0) {
    segments.shift();
  }

  if (segments.length > 0) {
    segments[0].text = segments[0].text.trimStart();
  }

  while (segments.length > 0 && segments.at(-1)?.text.trimEnd().length == 0) {
    segments.pop();
  }

  if (segments.length > 0) {
    segments[segments.length - 1].text = segments[segments.length - 1].text.trimEnd();
  }

  return plainText.length > 0
    ? { version: 1, segments }
    : null;
}

export function createAnnouncementContent(
  message: string | null | undefined,
): AnnouncementContent | null {
  const text = normalizeAnnouncementText(message ?? "").trim();

  return text.length > 0
    ? { version: 1, segments: [{ text }] }
    : null;
}

export function resolveAnnouncementContent(
  content: unknown,
  message: string | null | undefined,
): AnnouncementContent | null {
  return normalizeAnnouncementContent(content) ?? createAnnouncementContent(message);
}

export function resolveAnnouncementPlainText(
  content: AnnouncementContent | null,
): string | null {
  const text = content?.segments.map((segment) => segment.text).join("").trim();
  return text && text.length > 0 ? text : null;
}

export function resolveAnnouncementType(value: unknown): AnnouncementType {
  return value == "IMPROVEMENT" || value == "PROBLEM" || value == "NOTICE"
    ? value
    : DEFAULT_ANNOUNCEMENT_TYPE;
}
