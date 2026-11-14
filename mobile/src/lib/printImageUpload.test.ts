import { describe, expect, it } from "vitest";
import { checkPrintImage, PRINT_IMAGE_MAX_BYTES } from "./printImageUpload";

describe("print gallery image rules", () => {
  it("accepts the formats the website upload route accepts", () => {
    expect(
      checkPrintImage({ name: "a.jpg", mimeType: "image/jpeg", size: 1000 }),
    ).toEqual({
      ok: true,
      extension: "jpg",
      contentType: "image/jpeg",
    });
    const png = checkPrintImage({
      name: "b.PNG",
      mimeType: "image/png",
      size: 10,
    });
    expect(png.ok && png.extension).toBe("png");
    const webp = checkPrintImage({
      name: "c.webp",
      mimeType: "image/webp",
      size: 10,
    });
    expect(webp.ok && webp.contentType).toBe("image/webp");
    const gif = checkPrintImage({
      name: "d.gif",
      mimeType: "image/gif",
      size: 10,
    });
    expect(gif.ok && gif.extension).toBe("gif");
  });

  it("falls back to the file name when the picker omits a mime type", () => {
    const result = checkPrintImage({ name: "photo.jpeg", size: 10 });
    expect(result.ok && result.extension).toBe("jpg");
    expect(result.ok && result.contentType).toBe("image/jpeg");
  });

  it("rejects anything that is not a supported image", () => {
    expect(
      checkPrintImage({ name: "model.stl", mimeType: "model/stl", size: 10 }),
    ).toEqual({
      ok: false,
      error: expect.stringContaining("JPG"),
    });
    expect(
      checkPrintImage({ name: "a.pdf", mimeType: "application/pdf", size: 10 })
        .ok,
    ).toBe(false);
    expect(checkPrintImage({ name: "", mimeType: "", size: 0 }).ok).toBe(false);
  });

  it("rejects files over the 8 MB budget before uploading", () => {
    const result = checkPrintImage({
      name: "big.jpg",
      mimeType: "image/jpeg",
      size: PRINT_IMAGE_MAX_BYTES + 1,
    });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("8 MB"),
    });
  });
});
