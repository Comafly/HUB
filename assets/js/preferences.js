export const STEPPER_PREFERENCES = {
  gridRowLimit: {min: 1, max: 8, step: 1, fallback: 3},
  resultsPerPage: {min: 5, max: 50, step: 5, fallback: 25},
};

export function normalizePreference(key, value) {
  const {min, max, step, fallback} = STEPPER_PREFERENCES[key];
  const number = Number(value);
  return Math.max(min, Math.min(max, Math.round((value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : fallback) / step) * step));
}
