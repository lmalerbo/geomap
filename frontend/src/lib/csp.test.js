import { describe, expect, it } from "vitest";
import { cspContent } from "../../csp.js";

// Virada do login único (22/10): a CSP do build bloqueava o Supabase do Hub e o login
// digitado falhava sempre ("Refused to connect ... violates the document's Content Security Policy").
describe("CSP do build", () => {
  const connect = cspContent("build").split("; ").find((d) => d.startsWith("connect-src"));

  it("deixa o app falar com o Supabase do Hub (login único)", () => {
    expect(connect).toContain("https://dpvsivypabmvmrrpgmhc.supabase.co");
  });

  it("continua liberando o backend, os mapas e o R2", () => {
    for (const origem of ["'self'", "https://server.arcgisonline.com", "https://*.r2.cloudflarestorage.com"]) {
      expect(connect).toContain(origem);
    }
  });
});
