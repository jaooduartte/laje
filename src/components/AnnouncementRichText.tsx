import { Fragment } from "react";
import type { AnnouncementContent } from "@/lib/announcement";

export function AnnouncementRichText({
  content,
}: {
  content: AnnouncementContent;
}) {
  return (
    <>
      {content.segments.map((segment, index) => {
        let element = <Fragment key={index}>{segment.text}</Fragment>;

        if (segment.bold) {
          element = <strong key={index}>{element}</strong>;
        }

        if (segment.italic) {
          element = <em key={index}>{element}</em>;
        }

        if (segment.underline) {
          element = <u key={index}>{element}</u>;
        }

        return element;
      })}
    </>
  );
}
