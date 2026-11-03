import { describe, it, expect } from "vitest";
import { geometriaDoTrecho, areaTrechoHa, MAX_VERTICES_TRECHO } from "./trechoExcedente.js";

const quadrado = (x, y, l, z) => [[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]].map((p) => (z === undefined ? p : [...p, z]));
const feicao = (geometry) => ({ type: "Feature", properties: {}, geometry });

describe("geometriaDoTrecho", () => {
  it("um polígono só vira Polygon, sem altitude do KML", () => {
    const g = geometriaDoTrecho({ type: "FeatureCollection", features: [feicao({ type: "Polygon", coordinates: [quadrado(-47.6, -21.1, 0.01, 520)] })] });
    expect(g.type).toBe("Polygon");
    expect(g.coordinates[0][0]).toEqual([-47.6, -21.1]);
  });

  it("várias feições e MultiPolygon viram um MultiPolygon só; linhas e pontos são ignorados", () => {
    const g = geometriaDoTrecho({
      type: "FeatureCollection",
      features: [
        feicao({ type: "Polygon", coordinates: [quadrado(-47.6, -21.1, 0.01)] }),
        feicao({ type: "MultiPolygon", coordinates: [[quadrado(-47.5, -21.1, 0.01)], [quadrado(-47.4, -21.1, 0.01)]] }),
        feicao({ type: "Point", coordinates: [-47.6, -21.1] }),
        feicao({ type: "LineString", coordinates: [[-47.6, -21.1], [-47.5, -21.0]] }),
      ],
    });
    expect(g.type).toBe("MultiPolygon");
    expect(g.coordinates).toHaveLength(3);
  });

  it("arquivo sem polígono dá erro legível", () => {
    expect(() => geometriaDoTrecho({ type: "FeatureCollection", features: [feicao({ type: "Point", coordinates: [0, 0] })] })).toThrow(/polígono/);
  });

  it("geometria grande demais dá erro legível", () => {
    const anel = Array.from({ length: MAX_VERTICES_TRECHO + 1 }, (_, i) => [-47 + i * 1e-6, -21]);
    anel.push(anel[0]);
    expect(() => geometriaDoTrecho({ type: "FeatureCollection", features: [feicao({ type: "Polygon", coordinates: [anel] })] })).toThrow(/pontos/);
  });

  it("coordenada fora de graus (shapefile sem .prj em UTM) dá erro legível", () => {
    expect(() => geometriaDoTrecho({ type: "FeatureCollection", features: [feicao({ type: "Polygon", coordinates: [quadrado(200000, 7600000, 100)] })] })).toThrow(/não estão em graus/);
  });
});

describe("areaTrechoHa", () => {
  it("calcula em hectares com 2 casas, descontando o buraco", () => {
    // ~100 m x 100 m perto do equador = ~1,23 ha (0,001° ≈ 111 m)
    const cheio = areaTrechoHa({ type: "Polygon", coordinates: [quadrado(0, 0, 0.001)] });
    const comBuraco = areaTrechoHa({ type: "Polygon", coordinates: [quadrado(0, 0, 0.001), quadrado(0.00025, 0.00025, 0.0005)] });
    expect(cheio).toBeCloseTo(1.23, 1);
    expect(comBuraco).toBeCloseTo(cheio * 0.75, 1);
    expect(Number.isInteger(cheio * 100)).toBe(true);
  });
});
