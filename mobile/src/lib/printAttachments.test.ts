import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_FILE_BYTES,
  attachmentSummary,
  checkQuoteAttachments,
  quoteFileExtension,
  type QuoteAttachment,
} from "./printAttachments";

const file = (name: string, size = 1024): QuoteAttachment => ({
  uri: `file:///cache/${name}`,
  name,
  size,
  mimeType: "application/octet-stream",
});

describe("quoteFileExtension", () => {
  it("accepts the CAD and photo types the website route accepts", () => {
    expect(quoteFileExtension("bracket.STL")).toBe("stl");
    expect(quoteFileExtension("part.step")).toBe("step");
    expect(quoteFileExtension("photo.jpeg")).toBe("jpeg");
  });

  it("rejects executables and names without an extension", () => {
    expect(quoteFileExtension("setup.exe")).toBeNull();
    expect(quoteFileExtension("README")).toBeNull();
  });
});

describe("checkQuoteAttachments", () => {
  it("accepts up to three valid files", () => {
    expect(
      checkQuoteAttachments([file("a.stl"), file("b.pdf"), file("c.png")]).ok,
    ).toBe(true);
  });

  it("rejects a fourth file", () => {
    const result = checkQuoteAttachments([
      file("a.stl"),
      file("b.stl"),
      file("c.stl"),
      file("d.stl"),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over 10 MB", () => {
    const result = checkQuoteAttachments([
      file("big.stl", MAX_QUOTE_FILE_BYTES + 1),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported type before uploading", () => {
    const result = checkQuoteAttachments([file("model.dwg")]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/STL/);
  });
});

describe("attachmentSummary", () => {
  it("counts files and shows the total size", () => {
    expect(attachmentSummary([])).toBe("No files attached");
    expect(attachmentSummary([file("a.stl", 2 * 1024 * 1024)])).toBe(
      "1 file · 2 MB",
    );
  });
});
