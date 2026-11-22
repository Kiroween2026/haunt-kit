import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button,
  Card,
  Countdown,
  Modal,
  PlayerGhost,
  QRPanel,
  Scoreboard,
  ThemeProvider,
  ToastRegion,
  rankRows,
  secondsLeft,
  type ScoreRow,
} from "./index";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("ThemeProvider", () => {
  it.each(["haunted", "lantern"] as const)("sets data-theme=%s", (theme) => {
    expect(html(<ThemeProvider theme={theme}>x</ThemeProvider>)).toContain(`data-theme="${theme}"`);
  });
});

describe("Button", () => {
  it("is a real button that never submits a form by accident", () => {
    expect(html(<Button>Go</Button>)).toMatch(
      /<button type="button" class="hk-button hk-button--primary">Go<\/button>/,
    );
  });
  it("supports variants, size and disabled", () => {
    const out = html(
      <Button variant="danger" size="large" disabled>
        Stop
      </Button>,
    );
    expect(out).toContain("hk-button--danger");
    expect(out).toContain("hk-button--large");
    expect(out).toContain("disabled");
  });
});

describe("Card", () => {
  it("is a region labelled by its title", () => {
    const out = html(<Card title="Lobby">hi</Card>);
    expect(out).toMatch(
      /<section class="hk-card" aria-labelledby="([^"]+)"><h2 id="\1">Lobby<\/h2>hi<\/section>/,
    );
  });
  it("has no label without a title and supports heading levels", () => {
    expect(html(<Card>hi</Card>)).not.toContain("aria-labelledby");
    expect(
      html(
        <Card title="T" level={3}>
          hi
        </Card>,
      ),
    ).toContain("<h3");
  });
});

describe("Modal", () => {
  it("is a labelled native dialog", () => {
    const out = html(
      <Modal open={false} title="Leave game?" onClose={() => {}} actions={<Button>Yes</Button>}>
        Sure?
      </Modal>,
    );
    expect(out).toMatch(
      /<dialog class="hk-modal" aria-labelledby="([^"]+)"><h2 id="\1">Leave game\?<\/h2>Sure\?<div class="hk-modal__actions">/,
    );
  });
});

describe("PlayerGhost", () => {
  it("is named for screen readers and uses the player's color", () => {
    const out = html(<PlayerGhost name="Casper" color="#8be9fd" />);
    expect(out).toContain('aria-label="Casper"');
    expect(out).toContain("--ghost-color:#8be9fd");
    expect(out).toContain('fill="#8be9fd"');
  });
  it("says when a player is out or away", () => {
    expect(html(<PlayerGhost name="Boo" color="#ff79c6" status="out" />)).toContain('aria-label="Boo, Out"');
    expect(html(<PlayerGhost name="Boo" color="#ff79c6" status="away" />)).toContain("Reconnecting");
  });
});

describe("QRPanel", () => {
  const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  it("shows the code, the QR code and the link, and speaks the code letter by letter", () => {
    const out = html(<QRPanel code="KRVX" svg={svg} joinUrl="https://play.test/?room=KRVX" />);
    expect(out).toContain(">KRVX<");
    expect(out).toContain('aria-label="Room code K R V X"');
    expect(out).toContain('aria-label="QR code to join room K R V X"');
    expect(out).toContain(svg);
    expect(out).toContain("https://play.test/?room=KRVX");
  });
});

describe("Scoreboard", () => {
  const rows: ScoreRow[] = [
    { id: "a", name: "Ana", color: "#8be9fd", score: 5 },
    { id: "b", name: "Ben", color: "#ff79c6", score: 9 },
    { id: "c", name: "Cy", color: "#50fa7b", score: 9 },
  ];
  it("ranks highest first, and ties share a rank", () => {
    expect(rankRows(rows).map((r) => [r.name, r.rank])).toEqual([
      ["Ben", 1],
      ["Cy", 1],
      ["Ana", 3],
    ]);
  });
  it("is a table with headers and a caption", () => {
    const out = html(<Scoreboard rows={rows} title="Round 1" />);
    expect(out).toContain("<caption>Round 1</caption>");
    expect(out).toContain('scope="col"');
    expect(out).toContain('scope="row"');
    expect(out.match(/hk-scoreboard__row--leader/g)).toHaveLength(2);
  });
  it("never marks a leader when everyone has 0", () => {
    expect(html(<Scoreboard rows={rows.map((r) => ({ ...r, score: 0 }))} />)).not.toContain("--leader");
  });
  it("property: ranks are sorted, start at 1, and match the order of scores", () => {
    const row = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 12 }),
      color: fc.constant("#ffffff"),
      score: fc.integer({ min: 0, max: 50 }),
    });
    fc.assert(
      fc.property(fc.array(row, { maxLength: 8 }), (list) => {
        const ranked = rankRows(list);
        expect(ranked).toHaveLength(list.length);
        for (let i = 1; i < ranked.length; i++) {
          expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
          expect(ranked[i]!.rank).toBeGreaterThanOrEqual(ranked[i - 1]!.rank);
        }
        if (ranked[0]) expect(ranked[0].rank).toBe(1);
      }),
    );
  });
});

describe("Countdown", () => {
  it("renders the starting number as a timer that isn't announced every second", () => {
    const out = html(<Countdown from={10} />);
    expect(out).toContain('role="timer"');
    expect(out).toContain('aria-live="off"');
    expect(out).toContain(">10<");
  });
  it("secondsLeft rounds up and never goes below 0", () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 1)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e6 }), fc.integer({ min: 0, max: 2e6 }), (total, elapsed) => {
        const left = secondsLeft(total, elapsed);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left).toBeLessThanOrEqual(Math.ceil(total / 1000));
      }),
    );
  });
});

describe("Toast", () => {
  it("is a polite live region with a labelled dismiss button", () => {
    const out = html(
      <ToastRegion toasts={[{ id: 1, message: "Casper joined", kind: "success" }]} onDismiss={() => {}} />,
    );
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain("hk-toast--success");
    expect(out).toContain('aria-label="Dismiss: Casper joined"');
  });
});
