// Format examples shown as clickable hints in CodeChipInput -- illustrative
// of the expected J1939/OBD-II format only, not a claim about real data.
export const EXAMPLE_FAULT_CODES = ['SPN 102 FMI 3', 'P0299', 'SPN 3251 FMI 0'];

/**
 * Normalizes user input into a canonical code string.
 * Accepts "SPN 102 FMI 3", "spn102fmi3", "102/3", "102-3", "P0299", etc.
 * Returns null if the input isn't a recognizable code format.
 */
export function normalizeFaultCode(input) {
  const s = input.trim().toUpperCase();
  const obd = s.replace(/\s+/g, '').match(/^[PBCU][0-3][0-9A-F]{3}$/);
  if (obd) return obd[0];

  const j1939 = s.match(/^(?:SPN\s*)?(\d{1,6})\s*(?:(?:[/\-:]|\s)\s*(?:FMI\s*)?|FMI\s*)(\d{1,2})$/);
  if (j1939 && Number(j1939[2]) <= 31) {
    return `SPN ${Number(j1939[1])} FMI ${Number(j1939[2])}`;
  }
  return null;
}
