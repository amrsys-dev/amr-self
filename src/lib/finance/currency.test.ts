import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convert, FALLBACK_RATES, formatNumber, parseAmount } from "./currency.ts";

describe("currency", () => {
  it("shows only the digits that matter", () => {
    assert.equal(formatNumber(15), "15");
    assert.equal(formatNumber(15000), "15 000");
    assert.equal(formatNumber(15.5), "15.50");
    assert.equal(formatNumber(1234567.05), "1 234 567.05");
    assert.equal(formatNumber(-70), "−70");
  });
  it("converts through the dollar and treats old records as SAR", () => {
    assert.equal(convert(375, "SAR", "USD", FALLBACK_RATES), 100);
    assert.equal(convert(375, undefined, "USD", FALLBACK_RATES), 100);
    assert.equal(convert(100, "USD", "SAR", FALLBACK_RATES), 375);
    assert.equal(convert(50, "RUB", "RUB", FALLBACK_RATES), 50);
  });
  it("reads amounts typed with comma or spaces", () => {
    assert.equal(parseAmount("15,5"), 15.5);
    assert.equal(parseAmount("15 000"), 15000);
    assert.ok(Number.isNaN(parseAmount("abc")));
  });
});
