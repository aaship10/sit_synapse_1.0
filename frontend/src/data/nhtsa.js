// Real VIN decoding via NHTSA vPIC (public, CORS-enabled, no API key).
const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues';

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Returns { vin, make, model, year, engine, bodyClass, gvwr, warning }.
 * Throws an Error with a user-facing message on failure.
 */
export async function decodeVin(vin) {
  const clean = vin.trim().toUpperCase();
  if (!VIN_PATTERN.test(clean)) {
    throw new Error('VIN must be 17 characters (letters I, O, and Q are not used).');
  }

  let res;
  try {
    res = await fetch(`${VPIC_URL}/${clean}?format=json`);
  } catch {
    throw new Error('Could not reach the NHTSA VIN service. Check your connection or use manual entry.');
  }
  if (!res.ok) throw new Error(`NHTSA VIN service returned ${res.status}.`);

  const data = await res.json();
  const r = data.Results?.[0];
  if (!r || !r.Make || !r.ModelYear) {
    throw new Error('No vehicle found for this VIN. Check the characters or use manual entry.');
  }

  const toTitle = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const engine = [r.EngineManufacturer, r.EngineModel, r.DisplacementL && `${Number(r.DisplacementL).toFixed(1)} L`]
    .filter(Boolean)
    .join(' ');

  return {
    vin: clean,
    make: toTitle(r.Make),
    model: r.Model || '',
    year: Number(r.ModelYear),
    engine,
    bodyClass: r.BodyClass || '',
    gvwr: r.GVWR || '',
    // ErrorCode "0" means a clean decode; anything else is a partial decode worth flagging.
    warning: r.ErrorCode && r.ErrorCode !== '0' ? r.ErrorText : '',
  };
}
