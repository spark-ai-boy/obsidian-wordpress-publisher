import { describe, expect, it } from "vitest";
import {
  remoteChanged,
  remoteChangedSince,
  toWordPressDate
} from "../src/utils/date";

describe("date helpers", () => {
  it("converts datetime-local values to WordPress dates", () => {
    expect(toWordPressDate("2026-12-01T09:30")).toBe("2026-12-01T09:30:00");
    expect(toWordPressDate("2026-12-01 09:30:45")).toBe(
      "2026-12-01T09:30:45"
    );
    expect(toWordPressDate("")).toBe("");
  });

  it("prefers comparing stored remote modified values", () => {
    expect(
      remoteChanged(
        "2026-12-01T09:30:00",
        "2026-12-01T09:30:00",
        "2026-11-01T00:00:00.000Z"
      )
    ).toBe(false);
    expect(
      remoteChanged(
        "2026-12-02T09:30:00",
        "2026-12-01T09:30:00",
        "2026-11-01T00:00:00.000Z"
      )
    ).toBe(true);
  });

  it("falls back to timestamps when no remote value was stored", () => {
    expect(
      remoteChangedSince("2026-12-02T09:30:00", "2026-12-01T09:30:00")
    ).toBe(true);
    expect(remoteChangedSince(undefined, "2026-12-01T09:30:00")).toBe(false);
  });
});
