import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const livePageSource = readFileSync(
  resolve(process.cwd(), "src/pages/live/LivePage.tsx"),
  "utf8",
);
const livePageViewSource = readFileSync(
  resolve(process.cwd(), "src/pages/live/LivePageView.tsx"),
  "utf8",
);
const placeholderCardSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/ChampionshipKnockoutPlaceholderCard.tsx",
  ),
  "utf8",
);

describe("live page knockout placeholders", () => {
  it("includes unresolved scheduled knockout slots in the upcoming timeline", () => {
    expect(livePageSource).toContain(
      "!knockoutMatch.match_id && Boolean(knockoutMatch.scheduled_date)",
    );
    expect(livePageSource).toContain("placeholders: knockoutPlaceholders");
    expect(livePageSource).toContain(
      "home_team_name: knockoutMatch.home_team_name",
    );
    expect(livePageSource).toContain(
      "away_team_name: knockoutMatch.away_team_name",
    );
  });

  it("renders unresolved knockout cards on the live overview", () => {
    expect(livePageViewSource).toContain(
      'item.type == "KNOCKOUT_PLACEHOLDER"',
    );
    expect(livePageViewSource).toContain(
      "<ChampionshipKnockoutPlaceholderCard",
    );
  });

  it("shows a known participant without hiding the unresolved side", () => {
    expect(placeholderCardSource).toContain(
      'placeholder.home_team_name ?? "A definir"',
    );
    expect(placeholderCardSource).toContain(
      'placeholder.away_team_name ?? "A definir"',
    );
  });
});
