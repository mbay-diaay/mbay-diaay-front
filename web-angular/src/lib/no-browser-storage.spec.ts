import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Règle du propriétaire : rien dans le navigateur (stockage local, de session, base du navigateur, cookies lisibles
 * par le JavaScript). Session et préférences vivent côté serveur ; le jeton d'accès reste en mémoire.
 */
const FORBIDDEN = /localStorage|sessionStorage|indexedDB|document\.cookie/;
const SRC_ROOT = join(__dirname, "..");

/** Exception décidée par le propriétaire (25/11/2026) : le rideau « en construction » est conservé pour l'instant. */
const ALLOWED = [join("lib", "site-gate.ts")];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|html)$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
  });
}

describe("aucun stockage dans le navigateur", () => {
  it("n'utilise ni localStorage, ni sessionStorage, ni indexedDB, ni document.cookie dans src/", () => {
    const offenders = sourceFiles(SRC_ROOT).filter(
      (path) =>
        !ALLOWED.some((allowed) => path.endsWith(allowed)) &&
        FORBIDDEN.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
