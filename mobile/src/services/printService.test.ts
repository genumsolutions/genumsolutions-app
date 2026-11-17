import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fallbackPrintContent,
  getPrintContent,
  submitPrintQuote,
  validatePrintQuote,
} from "./printService";
import type { QuoteAttachment } from "../lib/printAttachments";

// The app reads print content and posts quote requests through the website's
// public routes. These tests pin the mapping (live -> screen shape), the
// fallback path (offline never blanks the section) and the client-side
// validation that mirrors the route.

function file(
  name: string,
  size = 1024,
  type = "application/octet-stream",
): QuoteAttachment {
  return { uri: `file:///cache/${name}`, name, size, mimeType: type };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("getPrintContent", () => {
  it("maps the website payload into the screen shape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        settings: {
          calculatorEnabled: true,
          minimumOrder: 500,
          designBaseCharge: 3000,
        },
        materials: [
          {
            id: "pla",
            name: "PLA",
            description: "d",
            ratePerGram: 15,
            note: "",
          },
        ],
        promotions: [
          {
            id: "p1",
            title: "Launch offer",
            body: "10% off",
            ctaLabel: "Ask",
            ctaHref: "#quote",
            discountType: "percent",
            discountValue: 10,
          },
        ],
      }),
    );

    const { content, source } = await getPrintContent();
    expect(source).toBe("live");
    expect(content.calculatorEnabled).toBe(true);
    expect(content.minimumOrder).toBe(500);
    expect(content.materials[0]?.ratePerGram).toBe(15);
    expect(content.promotion?.title).toBe("Launch offer");
  });

  it("falls back when the route errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    const { content, source } = await getPrintContent();
    expect(source).toBe("fallback");
    expect(content).toEqual(fallbackPrintContent);
  });

  it("falls back when the network throws", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { content, source } = await getPrintContent();
    expect(source).toBe("fallback");
    expect(content.materials.length).toBeGreaterThan(0);
    expect(content.materials.every((m) => m.ratePerGram === 0)).toBe(true);
  });

  it("uses fallback materials when the live list is empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ materials: [], settings: {} }));
    const { content } = await getPrintContent();
    expect(content.materials).toEqual(fallbackPrintContent.materials);
    expect(content.minimumOrder).toBe(fallbackPrintContent.minimumOrder);
  });
});

describe("validatePrintQuote", () => {
  const valid = {
    name: "Asha",
    email: "asha@example.com",
    description: "Replacement knob for a pressure cooker lid.",
    quantity: 2,
  };

  it("accepts a complete request and trims values", () => {
    const result = validatePrintQuote({ ...valid, name: "  Asha  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Asha");
  });

  it("rejects missing name, bad email and short description", () => {
    expect(validatePrintQuote({ ...valid, name: " " }).ok).toBe(false);
    expect(validatePrintQuote({ ...valid, email: "nope" }).ok).toBe(false);
    expect(validatePrintQuote({ ...valid, description: "part" }).ok).toBe(
      false,
    );
  });

  it("clamps quantity to 1..10000", () => {
    expect(validatePrintQuote({ ...valid, quantity: 0 }).ok).toBe(false);
    expect(validatePrintQuote({ ...valid, quantity: 10001 }).ok).toBe(false);
    const result = validatePrintQuote({ ...valid, quantity: 3 });
    expect(result.ok && result.value.quantity).toBe(3);
  });
});

describe("submitPrintQuote", () => {
  it("does not call the network for an invalid request", async () => {
    const result = await submitPrintQuote({
      name: "",
      email: "bad",
      description: "x",
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the validated value and reports success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, id: "q1" }));
    const result = await submitPrintQuote({
      name: "Asha",
      email: "asha@example.com",
      description: "A replacement knob for a pressure cooker lid.",
      quantity: 2,
      material: "PLA",
    });
    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/print/quote");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Asha",
      quantity: 2,
      material: "PLA",
    });
  });

  it("posts attached files as multipart", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, id: "q2" }));
    const result = await submitPrintQuote({
      name: "Asha",
      email: "asha@example.com",
      description: "A replacement knob for a pressure cooker lid.",
      quantity: 1,
      files: [file("bracket.stl", 2 * 1024 * 1024, "model/stl")],
    });
    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe("[object FormData]");
    expect(init.headers).toMatchObject({ accept: "application/json" });
  });

  it("keeps the request JSON when files are empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, id: "q3" }));
    await submitPrintQuote({
      name: "Asha",
      email: "asha@example.com",
      description: "A replacement knob for a pressure cooker lid.",
      quantity: 1,
      files: [],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ quantity: 1 });
  });

  it("falls back to text-only validation error when attached files are rejected", async () => {
    const result = await submitPrintQuote({
      name: "Asha",
      email: "asha@example.com",
      description: "A replacement knob for a pressure cooker lid.",
      quantity: 1,
      files: [file("model.exe")],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/STL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Too many quote requests." }, 429),
    );
    const result = await submitPrintQuote({
      name: "Asha",
      email: "asha@example.com",
      description: "A replacement knob for a pressure cooker lid.",
      quantity: 1,
    });
    expect(result).toEqual({ ok: false, error: "Too many quote requests." });
  });

  it("explains a network failure in plain language", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await submitPrintQuote({
      name: "Asha",
      email: "asha@example.com",
      description: "A replacement knob for a pressure cooker lid.",
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/connection/i);
  });
});
