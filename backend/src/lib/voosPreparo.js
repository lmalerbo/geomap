// Voos do Preparo (Hub, spec 2026-10-29-preparo-fase-voo-design.md): só leitura.
// O analista agenda Sistematização/Expansão direto no DroneManagement; o Hub só
// acompanha a situação. Cancelados (controlStatus 11) vão junto: quem filtra é o Hub.

export const PROJETOS_VOO_PREPARO = ["Sistematização", "Expansão"];

export function secaoValida(s) {
  return typeof s === "string" && /^\d{1,6}$/.test(s);
}

export function filtroVoosPreparo(unitId, section) {
  return JSON.stringify({ $and: [{ unitId: `UUID('${unitId}')` }, { section }] });
}

export function mapearVoosPreparo(registros) {
  return registros
    .filter((r) => PROJETOS_VOO_PREPARO.includes(r.flightProjectDetails?.description))
    .map((r) => ({
      id: r.id, section: r.section, landPlot: String(r.landPlot), projeto: r.flightProjectDetails.description,
      controlStatus: r.controlStatus, verifyFlightSize: r.verifyFlightSize ?? null,
      createdUtc: r.createdUtc, scheduledDate: r.scheduledDate ?? null,
      startDateFlight: r.startDateFlight ?? null, modifiedUtc: r.modifiedUtc ?? null,
    }));
}
