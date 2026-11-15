import { describe, expect, it } from "vitest";
import { fitWithin, imageProblem } from "./image";

describe("imageProblem", () => {
  it("accepte JPEG, PNG et WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(imageProblem({ type, size: 1000 })).toBeNull();
  });

  it("refuse le SVG, le PDF et le GIF", () => {
    for (const type of ["image/svg+xml", "application/pdf", "image/gif"])
      expect(imageProblem({ type, size: 1000 })).toBe("type");
  });

  it("refuse un fichier de plus de 10 Mo avant réduction", () => {
    expect(imageProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe("size");
    expect(imageProblem({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
  });
});

describe("fitWithin", () => {
  it("réduit le plus grand côté à 512 px en gardant les proportions", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 512, height: 384 });
    expect(fitWithin(1000, 2000)).toEqual({ width: 256, height: 512 });
  });

  it("n'agrandit jamais une petite image", () => {
    expect(fitWithin(200, 100)).toEqual({ width: 200, height: 100 });
  });
});
