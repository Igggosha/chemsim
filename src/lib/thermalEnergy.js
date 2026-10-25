export const LIQUID_SPECIFIC_HEAT_J_PER_G_K = 4.18;

export function calculateTemperatureChange(
  heatJoules,
  massGrams,
  specificHeatJPerGramKelvin = LIQUID_SPECIFIC_HEAT_J_PER_G_K,
) {
  if (
    !Number.isFinite(heatJoules) ||
    !Number.isFinite(massGrams) ||
    massGrams < 0 ||
    !Number.isFinite(specificHeatJPerGramKelvin) ||
    specificHeatJPerGramKelvin <= 0
  ) {
    throw new TypeError("Heat, mass, and specific heat must be valid values.");
  }
  if (massGrams === 0) return 0;
  return heatJoules / (massGrams * specificHeatJPerGramKelvin);
}

export function applyHeatToContainer(
  container,
  heatJoules,
  specificHeatJPerGramKelvin = LIQUID_SPECIFIC_HEAT_J_PER_G_K,
) {
  if (!container || !Number.isFinite(container.totalMass)) {
    throw new TypeError("A mixture container with a finite mass is required.");
  }
  if (container.totalMass === 0) return false;

  const temperatureChange = calculateTemperatureChange(
    heatJoules,
    container.totalMass,
    specificHeatJPerGramKelvin,
  );
  const nextTemperature = Math.max(0, container.temperatureKelvin + temperatureChange);
  if (nextTemperature === container.temperatureKelvin) return false;
  container.temperatureKelvin = nextTemperature;
  return true;
}
