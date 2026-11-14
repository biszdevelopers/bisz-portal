import { describe, expect, test } from "bun:test";
import { csvCell, csvHeader, csvRow } from "../server/utils/csv";

describe("CSV export", () => {
  test("quotes cells and doubles embedded quotes", () => {
    expect(csvCell('a "quoted" value')).toBe('"a ""quoted"" value"');
    expect(csvRow(["a", 1, null])).toBe('"a","1",""\r\n');
  });

  test("neutralizes spreadsheet formula injection", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("\"'=SUM(A1:A2)\"");
    expect(csvCell("+cmd")).toBe("\"'+cmd\"");
    expect(csvCell("-1+2")).toBe("\"'-1+2\"");
    expect(csvCell("@user")).toBe("\"'@user\"");
  });

  test("writes a header row", () => {
    expect(csvHeader(["a", "b"])).toBe('"a","b"\r\n');
  });
});
