import { describe, expect, it } from "vitest";
import { mensagemErroLogin } from "./erroLogin.js";

// Virada do login único (22/10): toda falha do Supabase aparecia como "E-mail ou senha incorretos",
// inclusive quando a senha estava certa (corrida com a entrada automática, rede, limite de tentativas).
describe("mensagemErroLogin", () => {
  it("senha errada de verdade", () => {
    expect(mensagemErroLogin({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
    expect(mensagemErroLogin({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
  });

  it("conta bloqueada", () => {
    expect(mensagemErroLogin({ code: "user_banned", message: "User is banned" })).toMatch(/bloqueado/);
  });

  it("qualquer outra falha não acusa a senha", () => {
    for (const e of [{ message: "Acquiring an exclusive Navigator LockManager lock timed out" },
                     { code: "over_request_rate_limit", message: "Request rate limit reached" },
                     { name: "AuthRetryableFetchError", message: "Failed to fetch" }]) {
      const m = mensagemErroLogin(e);
      expect(m).not.toMatch(/senha incorret/i);
      expect(m).toMatch(/tente de novo/i);
    }
  });
});
