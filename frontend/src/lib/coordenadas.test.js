import { describe, it, expect } from "vitest";
import { formatarCoordenada } from "./coordenadas.js";

describe("formatarCoordenada", () => {
  it("usa lat, lng em graus decimais com 6 casas", () => {
    expect(formatarCoordenada({ lat: -21.1234564, lng: -47.6543216 })).toBe("-21.123456, -47.654322");
  });
  it("preenche zeros", () => {
    expect(formatarCoordenada({ lat: -21, lng: -47.5 })).toBe("-21.000000, -47.500000");
  });
});
