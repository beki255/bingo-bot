import { describe, expect, it } from "vitest";
import { extractTransactionRefFromInput, normalizePhoneNumber } from "./userService.js";

describe("userService helpers", () => {
  it("normalizes Ethiopian phone numbers consistently", () => {
    expect(normalizePhoneNumber("0911223344")).toBe("+251911223344");
    expect(normalizePhoneNumber("0713255371")).toBe("+251713255371");
    expect(normalizePhoneNumber("251911223344")).toBe("+251911223344");
    expect(normalizePhoneNumber("+251 911 223 344")).toBe("+251911223344");
  });

  it("extracts transaction references from Telebirr SMS, CBE SMS, URLs, and raw IDs", () => {
    expect(
      extractTransactionRefFromInput(
        "Dear Customer, You have transferred ETB 50.00 to 0953662372. Your transaction number is DB92XYZ123. Thank you."
      )
    ).toBe("DB92XYZ123");

    expect(
      extractTransactionRefFromInput(
        "https://transactioninfo.ethiotelecom.et/receipt/CEK8912AB3"
      )
    ).toBe("CEK8912AB3");

    expect(
      extractTransactionRefFromInput(
        "Your account has been debited ETB 100.00. Ref No FT25113ABCD9."
      )
    ).toBe("FT25113ABCD9");

    expect(extractTransactionRefFromInput("db92xyz123")).toBe("DB92XYZ123");
    expect(extractTransactionRefFromInput("hi")).toBeNull();
  });
});

