import { describe, expect, it } from "vitest";
import { galleryImages } from "./index";

describe("galleryImages (U-23)", () => {
  it("prepends the cover when it is not already in the gallery", () => {
    expect(
      galleryImages({ image: "cover.jpg", gallery: ["a.jpg", "b.jpg"] }),
    ).toEqual(["cover.jpg", "a.jpg", "b.jpg"]);
  });

  it("keeps the gallery order when the cover is already the lead entry", () => {
    expect(
      galleryImages({ image: "cover.jpg", gallery: ["cover.jpg", "a.jpg"] }),
    ).toEqual(["cover.jpg", "a.jpg"]);
  });

  it("uses the gallery alone when there is no cover", () => {
    expect(galleryImages({ image: "", gallery: ["a.jpg", "b.jpg"] })).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("falls back to the cover image only", () => {
    expect(galleryImages({ image: "cover.jpg", gallery: [] })).toEqual([
      "cover.jpg",
    ]);
  });

  it("returns an empty array with no images at all", () => {
    expect(galleryImages({})).toEqual([]);
  });
});
