/**
 * Mock data + data-access functions for DiagnosticIQ.
 *
 * All vehicles, VINs, part numbers, and manual citations here are FICTIONAL
 * sample data for the hackathon demo. This file still backs the Dashboard and
 * History pages' recent-diagnoses list (getDiagnosisHistory/getRecentDiagnoses).
 *
 * The New Diagnosis -> Results flow now runs on the real RAG backend instead:
 * see data/api.js for its getDiagnosis/runDiagnosis.
 */

// ---------------------------------------------------------------------------
// Fault code lookup (J1939 SPN/FMI + OBD-II)
// ---------------------------------------------------------------------------

export const FAULT_CODE_LOOKUP = {
  'SPN 102 FMI 3': {
    standard: 'J1939',
    component: 'Intake manifold (boost) pressure sensor',
    description: 'Sensor voltage above normal — signal circuit shorted high or sensor failed.',
  },
  'SPN 102 FMI 4': {
    standard: 'J1939',
    component: 'Intake manifold (boost) pressure sensor',
    description: 'Sensor voltage below normal — signal circuit shorted low or open.',
  },
  'SPN 100 FMI 1': {
    standard: 'J1939',
    component: 'Engine oil pressure',
    description: 'Oil pressure below safe operating range (most severe).',
  },
  'SPN 110 FMI 0': {
    standard: 'J1939',
    component: 'Engine coolant temperature',
    description: 'Coolant temperature above safe operating range (most severe).',
  },
  'SPN 111 FMI 1': {
    standard: 'J1939',
    component: 'Engine coolant level',
    description: 'Coolant level below safe operating range (most severe).',
  },
  'SPN 157 FMI 18': {
    standard: 'J1939',
    component: 'Fuel rail pressure',
    description: 'Fuel rail pressure below normal (moderately severe).',
  },
  'SPN 641 FMI 7': {
    standard: 'J1939',
    component: 'Variable geometry turbo (VGT) actuator',
    description: 'Actuator not responding or out of adjustment.',
  },
  'SPN 3251 FMI 0': {
    standard: 'J1939',
    component: 'DPF differential pressure',
    description: 'Pressure drop across diesel particulate filter too high (most severe).',
  },
  'SPN 3226 FMI 2': {
    standard: 'J1939',
    component: 'Aftertreatment outlet NOx sensor',
    description: 'NOx sensor reading erratic, intermittent, or implausible.',
  },
  'SPN 4364 FMI 18': {
    standard: 'J1939',
    component: 'SCR catalyst conversion efficiency',
    description: 'NOx conversion efficiency below required threshold.',
  },
  'SPN 1761 FMI 1': {
    standard: 'J1939',
    component: 'DEF tank level',
    description: 'Diesel exhaust fluid level critically low.',
  },
  P0299: {
    standard: 'OBD-II',
    component: 'Turbocharger / supercharger',
    description: 'Underboost condition — actual boost lower than commanded.',
  },
  P0217: {
    standard: 'OBD-II',
    component: 'Engine cooling system',
    description: 'Engine over-temperature condition detected.',
  },
  P2463: {
    standard: 'OBD-II',
    component: 'Diesel particulate filter',
    description: 'DPF restriction — soot accumulation above limit.',
  },
  P20EE: {
    standard: 'OBD-II',
    component: 'SCR NOx catalyst',
    description: 'SCR catalyst efficiency below threshold (bank 1).',
  },
};

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

// ---------------------------------------------------------------------------
// Vehicle catalog (manual entry dropdowns)
// ---------------------------------------------------------------------------

export const VEHICLE_CATALOG = {
  Freightliner: ['Cascadia', 'M2 106', '122SD'],
  International: ['LT', 'RH', 'HX'],
  Kenworth: ['T680', 'T880', 'W990'],
  Mack: ['Anthem', 'Granite', 'Pinnacle'],
  Peterbilt: ['579', '567', '389'],
  Volvo: ['VNL 760', 'VNL 860', 'VNR'],
  'Western Star': ['49X', '57X'],
};

export const VEHICLE_YEARS = Array.from({ length: 13 }, (_, i) => 2026 - i);

// Pulled directly from the Automotive Faults Dataset (one per System_Category)
// so a preset tag always maps onto real records the RAG backend can retrieve.
export const SYMPTOM_PRESETS = [
  'Engine overheating',
  'ABS warning light on',
  'Soft brake pedal',
  'Grinding noise from wheels',
  'Engine misfires',
  'Clicking sound when starting',
  'Whining noise from drivetrain',
  'Check engine light on',
  'No cold air from vents',
  'Black smoke from exhaust',
  'Clutch slipping',
  'Noise when turning steering wheel',
];

// ---------------------------------------------------------------------------
// Fleet vehicles (fictional)
// ---------------------------------------------------------------------------

const VEHICLES = {
  v1: { unit: '4127', year: 2019, make: 'Freightliner', model: 'Cascadia', engine: 'Detroit DD15', vin: '3AKJHHDR5KSKA4127', baseMileage: 412_880 },
  v2: { unit: '2210', year: 2021, make: 'Kenworth', model: 'T680', engine: 'PACCAR MX-13', vin: '1XKYD49X7MJ442210', baseMileage: 268_140 },
  v3: { unit: '3318', year: 2020, make: 'Peterbilt', model: '579', engine: 'PACCAR MX-13', vin: '1XPBD49X3LD763318', baseMileage: 331_502 },
  v4: { unit: '5102', year: 2022, make: 'Volvo', model: 'VNL 860', engine: 'Volvo D13', vin: '4V4NC9EH2NN295102', baseMileage: 187_220 },
  v5: { unit: '1964', year: 2018, make: 'International', model: 'LT', engine: 'Cummins X15', vin: '3HSDZAPR8JN611964', baseMileage: 538_760 },
  v6: { unit: '6045', year: 2021, make: 'Mack', model: 'Anthem', engine: 'Mack MP8', vin: '1M1AN4GY1MM016045', baseMileage: 244_915 },
};

// ---------------------------------------------------------------------------
// Diagnosis scenarios (the "AI output" part of a result)
// ---------------------------------------------------------------------------

const SCENARIOS = {
  boostSensor: {
    faultCodes: ['SPN 102 FMI 3'],
    symptoms: 'Loss of power under load; check engine lamp on; engine derate on grades.',
    severity: 'warning',
    severityReason:
      'ECM is substituting a default boost value and has derated torque. The truck can be driven to the shop at reduced power — avoid loaded grades.',
    repairEstimate: { low: 1.0, high: 1.5 },
    clarifyingQuestion: {
      question: 'Does the fault go active at key-on with the engine off, or only once the engine is running under load?',
      why: 'Active at key-on points strongly to the sensor or its circuit rather than an actual boost problem.',
      options: ['Active at key-on', 'Only under load', 'Not sure'],
    },
    causes: [
      {
        title: 'Failed intake manifold pressure sensor',
        confidence: 78,
        summary: 'Internal sensor failure driving signal voltage to the upper rail.',
        diagnosticSteps: [
          'With key on, engine off, read the boost pressure PID. Expect roughly atmospheric (~14.5 psia). A reading pinned near max points to the sensor or circuit.',
          'Back-probe the sensor signal pin. Expect about 1.0–1.2 V at key-on, engine off. Above 4.8 V confirms FMI 3.',
          'Unplug the sensor. If signal voltage drops to near 0 V and the code changes to FMI 4, the harness is good and the sensor is at fault.',
          'Confirm 5 V reference and ground at the connector (4.9–5.1 V, less than 0.2 V drop to ground).',
        ],
        repairSteps: [
          'Remove the sensor from the intake manifold (2 bolts, 10 mm).',
          'Inspect the O-ring bore for oil residue and clean it.',
          'Install the new sensor with a new O-ring and torque to 10 N·m.',
          'Clear codes, then run the engine to operating temperature and confirm boost reads plausibly during a road test.',
        ],
        parts: [
          { partNumber: 'DIQ-BPS-102', description: 'Intake manifold pressure / temperature sensor', qty: 1 },
          { partNumber: 'DIQ-OR-0217', description: 'Sensor O-ring, Viton', qty: 1 },
        ],
        source: { document: 'DD15 Troubleshooting Manual (sample)', section: 'SPN 102/FMI 3 — Intake manifold pressure circuit high', page: 214 },
      },
      {
        title: 'Signal wire shorted to 5 V reference in harness',
        confidence: 44,
        summary: 'Chafed harness near the turbo heat-shield bracket shorting the signal circuit high.',
        diagnosticSteps: [
          'Inspect the engine harness where it crosses the turbo heat-shield bracket for chafing or melted insulation.',
          'With the sensor and ECM disconnected, check resistance between the signal and 5 V reference circuits. Anything below 10 kΩ indicates a short.',
          'Wiggle-test the harness while watching the boost PID live.',
        ],
        repairSteps: [
          'Repair the damaged section with a sealed butt splice and heat-shrink.',
          'Re-route the harness and add abrasion sleeve at the contact point.',
          'Secure it with a new P-clamp away from the heat shield.',
        ],
        parts: [
          { partNumber: 'DIQ-SPL-18', description: 'Sealed butt splice kit, 18 AWG', qty: 1 },
          { partNumber: 'DIQ-SLV-12', description: 'Abrasion sleeve, 12 mm × 300 mm', qty: 1 },
        ],
        source: { document: 'DD15 Wiring Diagram Set (sample)', section: 'Engine harness — intake sensors', page: 38 },
      },
      {
        title: 'Corroded or water-intruded sensor connector',
        confidence: 19,
        summary: 'Moisture in the connector creating a high-resistance path between pins.',
        diagnosticSteps: [
          'Disconnect the sensor and inspect terminals for green corrosion or moisture.',
          'Check that the connector seal and terminal lock are intact.',
        ],
        repairSteps: [
          'Clean terminals with electrical contact cleaner and let them dry fully.',
          'Replace the connector pigtail if terminals are pitted.',
          'Apply dielectric grease to the seal (not the terminals) and reconnect.',
        ],
        parts: [{ partNumber: 'DIQ-PGT-3W', description: '3-way sensor connector pigtail', qty: 1 }],
        source: { document: 'Electrical Connector Service Guide (sample)', section: 'Sealed connector inspection', page: 12 },
      },
    ],
  },

  coolantLevel: {
    faultCodes: ['SPN 111 FMI 1', 'SPN 110 FMI 0'],
    symptoms: 'Low coolant lamp; high coolant temp on grade; sweet smell at the grille.',
    severity: 'critical',
    severityReason:
      'Coolant level and temperature are both outside safe limits. Continued operation risks head gasket or cylinder liner damage. Do not operate — tow if the leak cannot be found and topped off on site.',
    repairEstimate: { low: 2.0, high: 3.5 },
    clarifyingQuestion: {
      question: 'Is there visible coolant residue on the engine, or white exhaust smoke at cold start?',
      why: 'Visible residue suggests an external leak; white smoke without residue points to an internal leak.',
      options: ['Visible residue', 'White smoke', 'Neither'],
    },
    causes: [
      {
        title: 'External coolant leak (water pump or hose)',
        confidence: 71,
        summary: 'Coolant loss through the water pump weep hole or a softened lower radiator hose.',
        diagnosticSteps: [
          'Pressure-test the cooling system at 15 psi for 15 minutes with the engine cold.',
          'Inspect the water pump weep hole, lower radiator hose, and heater hose connections for residue.',
          'Use UV dye if the leak isn’t visible under pressure.',
        ],
        repairSteps: [
          'Replace the failed hose or water pump with a new gasket.',
          'Refill with the correct extended-life coolant and bleed air from the system.',
          'Re-run the pressure test and confirm the level holds after a heat cycle.',
        ],
        parts: [
          { partNumber: 'DIQ-WP-440', description: 'Water pump assembly with gasket', qty: 1 },
          { partNumber: 'DIQ-ELC-5G', description: 'Extended-life coolant, 50/50 premix (5 gal)', qty: 2 },
        ],
        source: { document: 'Cooling System Service Manual (sample)', section: 'Pressure testing and leak isolation', page: 57 },
      },
      {
        title: 'Internal leak — EGR cooler or head gasket',
        confidence: 38,
        summary: 'Coolant entering the intake or exhaust stream through a cracked EGR cooler core.',
        diagnosticSteps: [
          'Check the coolant expansion tank for combustion bubbles with the engine running.',
          'Perform a combustion leak (block) test on the coolant.',
          'Isolate and pressure-test the EGR cooler.',
        ],
        repairSteps: [
          'Replace the EGR cooler if the core fails the isolation test.',
          'If the cooler passes, escalate to head gasket inspection.',
        ],
        parts: [{ partNumber: 'DIQ-EGRC-15', description: 'EGR cooler assembly', qty: 1 }],
        source: { document: 'EGR System Diagnostics (sample)', section: 'EGR cooler isolation test', page: 91 },
      },
      {
        title: 'Faulty coolant level sensor',
        confidence: 17,
        summary: 'Sensor reporting low level while the tank is actually full.',
        diagnosticSteps: [
          'Visually confirm the actual coolant level in the expansion tank.',
          'Compare against the coolant level PID with the engine off.',
        ],
        repairSteps: ['Replace the coolant level sensor in the expansion tank.', 'Clear codes and verify.'],
        parts: [{ partNumber: 'DIQ-CLS-111', description: 'Coolant level sensor', qty: 1 }],
        source: { document: 'Cooling System Service Manual (sample)', section: 'Coolant level sensor', page: 63 },
      },
    ],
  },

  dpfPressure: {
    faultCodes: ['SPN 3251 FMI 0', 'P2463'],
    symptoms: 'Frequent regens; loss of power; DPF lamp on.',
    severity: 'warning',
    severityReason:
      'DPF restriction is high and a derate is likely soon. The truck can reach the shop, but do not dispatch it on a loaded route until the filter is regenerated or serviced.',
    repairEstimate: { low: 1.5, high: 4.0 },
    clarifyingQuestion: {
      question: 'When was the DPF last removed for ash cleaning?',
      why: 'Filters past their ash-cleaning interval can’t be recovered by a regen alone.',
      options: ['Under 200k mi ago', 'Over 200k mi ago', 'Unknown'],
    },
    causes: [
      {
        title: 'Soot overload from interrupted regenerations',
        confidence: 69,
        summary: 'Short-haul duty cycle is ending active regens before they complete.',
        diagnosticSteps: [
          'Review regen history: count completed vs. interrupted regens over the last 30 days.',
          'Check DPF soot load percentage and differential pressure at high idle.',
        ],
        repairSteps: [
          'Perform a parked (stationary) regeneration with the service tool.',
          'Confirm differential pressure returns to spec afterwards.',
          'Advise the driver on allowing regens to complete.',
        ],
        parts: [],
        source: { document: 'Aftertreatment Service Manual (sample)', section: 'Parked regeneration procedure', page: 122 },
      },
      {
        title: 'Ash-loaded filter past cleaning interval',
        confidence: 42,
        summary: 'Non-combustible ash accumulation that regens cannot burn off.',
        diagnosticSteps: [
          'Check the ash load estimate in the ECM.',
          'If a parked regen does not bring pressure into spec, suspect ash.',
        ],
        repairSteps: [
          'Remove the DPF and send it for thermal ash cleaning, or swap in an exchange unit.',
          'Reset the ash accumulator in the ECM after installation.',
        ],
        parts: [
          { partNumber: 'DIQ-DPF-EX', description: 'DPF exchange unit (cleaned)', qty: 1 },
          { partNumber: 'DIQ-VCL-10', description: 'V-band clamp and gasket kit', qty: 2 },
        ],
        source: { document: 'Aftertreatment Service Manual (sample)', section: 'DPF removal and ash cleaning', page: 131 },
      },
      {
        title: 'Cracked or plugged differential pressure sensor lines',
        confidence: 23,
        summary: 'Sensor tubes giving a false high reading.',
        diagnosticSteps: [
          'Inspect sensor tubes for cracks, kinks, or soot plugging.',
          'Compare the DP reading with the engine off; it should be near 0 kPa.',
        ],
        repairSteps: ['Clear or replace the sensor lines.', 'Replace the DP sensor if the key-on reading is offset.'],
        parts: [{ partNumber: 'DIQ-DPS-3251', description: 'DPF differential pressure sensor', qty: 1 }],
        source: { document: 'Aftertreatment Service Manual (sample)', section: 'DP sensor verification', page: 118 },
      },
    ],
  },

  scrEfficiency: {
    faultCodes: ['SPN 4364 FMI 18', 'SPN 3226 FMI 2'],
    symptoms: 'Check engine lamp on; no drivability complaint.',
    severity: 'safe',
    severityReason:
      'No derate is active and the inducement timer has not started. Safe to operate — schedule repair within the next service window.',
    repairEstimate: { low: 1.0, high: 2.5 },
    clarifyingQuestion: {
      question: 'Has the DEF tank been filled from a new source or bulk tote recently?',
      why: 'Contaminated or diluted DEF is the most common cause of low SCR efficiency.',
      options: ['Yes, recently', 'No', 'Not sure'],
    },
    causes: [
      {
        title: 'Poor-quality or contaminated DEF',
        confidence: 58,
        summary: 'Urea concentration outside the 31.8–33.2% range.',
        diagnosticSteps: [
          'Test DEF concentration with a refractometer.',
          'Inspect the tank for debris or discoloration.',
        ],
        repairSteps: [
          'Drain and flush the DEF tank; refill with fresh DEF.',
          'Run an SCR performance test with the service tool.',
        ],
        parts: [{ partNumber: 'DIQ-DEF-2.5', description: 'DEF, 2.5 gal jug', qty: 4 }],
        source: { document: 'SCR System Diagnostics (sample)', section: 'DEF quality check', page: 44 },
      },
      {
        title: 'Outlet NOx sensor drift',
        confidence: 47,
        summary: 'Erratic outlet NOx sensor under-reporting conversion (matches SPN 3226 FMI 2).',
        diagnosticSteps: [
          'Compare inlet and outlet NOx readings at idle; they should be within 10 ppm when SCR is cold.',
          'Check the sensor harness and power supply.',
        ],
        repairSteps: ['Replace the outlet NOx sensor.', 'Run the NOx sensor learn procedure.'],
        parts: [{ partNumber: 'DIQ-NOX-OUT', description: 'Outlet NOx sensor with control module', qty: 1 }],
        source: { document: 'SCR System Diagnostics (sample)', section: 'NOx sensor plausibility', page: 52 },
      },
      {
        title: 'DEF doser crystallization',
        confidence: 31,
        summary: 'Urea deposits restricting the doser spray pattern.',
        diagnosticSteps: ['Remove the doser and inspect the tip and mixer for white crystal buildup.', 'Run a doser quantity test.'],
        repairSteps: ['Clean or replace the doser.', 'Clean deposits from the decomposition tube.'],
        parts: [{ partNumber: 'DIQ-DOS-01', description: 'DEF doser valve with gasket', qty: 1 }],
        source: { document: 'SCR System Diagnostics (sample)', section: 'Doser inspection', page: 60 },
      },
    ],
  },

  oilPressure: {
    faultCodes: ['SPN 100 FMI 1'],
    symptoms: 'Oil pressure gauge low at idle; engine protection alarm.',
    severity: 'critical',
    severityReason:
      'Oil pressure below the engine protection threshold. Do not operate — risk of bearing and crankshaft damage.',
    repairEstimate: { low: 0.5, high: 6.0 },
    clarifyingQuestion: {
      question: 'What does the dipstick show right now, and does a mechanical gauge confirm low pressure?',
      why: 'Separates a real lubrication problem from a sensor fault before any teardown.',
      options: ['Oil level low', 'Level OK, pressure low', 'Level OK, pressure OK'],
    },
    causes: [
      {
        title: 'Low oil level from external leak',
        confidence: 64,
        summary: 'Oil loss at the oil pan gasket or rear main seal.',
        diagnosticSteps: ['Check the oil level and look for leak trails under the engine.', 'Verify pressure with a mechanical gauge.'],
        repairSteps: ['Repair the leak source.', 'Refill oil to spec and verify pressure at idle and 1,800 rpm.'],
        parts: [{ partNumber: 'DIQ-OPG-15', description: 'Oil pan gasket', qty: 1 }],
        source: { document: 'Lubrication System Manual (sample)', section: 'Low oil pressure diagnosis', page: 29 },
      },
      {
        title: 'Failed oil pressure sensor',
        confidence: 41,
        summary: 'Sensor reads low while the mechanical gauge shows normal pressure.',
        diagnosticSteps: ['Compare the sensor PID with the mechanical gauge reading.', 'Check the sensor connector for oil wicking.'],
        repairSteps: ['Replace the oil pressure sensor.', 'Clear codes and verify.'],
        parts: [{ partNumber: 'DIQ-OPS-100', description: 'Oil pressure sensor', qty: 1 }],
        source: { document: 'Lubrication System Manual (sample)', section: 'Oil pressure sensor test', page: 33 },
      },
      {
        title: 'Oil pump or pickup tube restriction',
        confidence: 22,
        summary: 'Worn pump or blocked pickup screen reducing flow.',
        diagnosticSteps: ['Cut open the oil filter and check for metal debris.', 'Drop the pan and inspect the pickup screen.'],
        repairSteps: ['Clean or replace the pickup tube.', 'Replace the oil pump if clearances are out of spec.'],
        parts: [{ partNumber: 'DIQ-OP-500', description: 'Oil pump assembly', qty: 1 }],
        source: { document: 'Lubrication System Manual (sample)', section: 'Oil pump inspection', page: 41 },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Diagnosis history records
// ---------------------------------------------------------------------------

const TECHNICIAN = 'J. Morales';

const HISTORY_RECORDS = [
  { id: 'mock-1', createdAt: '2026-09-26T09:42:00', vehicle: 'v1', scenario: 'boostSensor', feedback: null, milesOffset: 0 },
  { id: 'mock-2', createdAt: '2026-09-25T15:18:00', vehicle: 'v4', scenario: 'dpfPressure', feedback: 'positive', milesOffset: 0 },
  { id: 'mock-3', createdAt: '2026-09-25T10:05:00', vehicle: 'v2', scenario: 'coolantLevel', feedback: 'positive', milesOffset: 0 },
  { id: 'mock-4', createdAt: '2026-09-24T13:47:00', vehicle: 'v5', scenario: 'scrEfficiency', feedback: 'negative', milesOffset: 0 },
  { id: 'mock-5', createdAt: '2026-09-23T08:31:00', vehicle: 'v3', scenario: 'oilPressure', feedback: 'positive', milesOffset: 0 },
  { id: 'mock-6', createdAt: '2026-09-22T16:02:00', vehicle: 'v6', scenario: 'boostSensor', feedback: 'positive', milesOffset: -1_210 },
  { id: 'mock-7', createdAt: '2026-09-20T11:25:00', vehicle: 'v1', scenario: 'dpfPressure', feedback: null, milesOffset: -2_340 },
  { id: 'mock-8', createdAt: '2026-09-18T14:10:00', vehicle: 'v2', scenario: 'scrEfficiency', feedback: 'positive', milesOffset: -3_905 },
  { id: 'mock-9', createdAt: '2026-09-17T09:55:00', vehicle: 'v4', scenario: 'coolantLevel', feedback: 'negative', milesOffset: -4_420 },
  { id: 'mock-10', createdAt: '2026-09-15T12:40:00', vehicle: 'v5', scenario: 'boostSensor', feedback: 'positive', milesOffset: -5_870 },
  { id: 'mock-11', createdAt: '2026-09-12T10:18:00', vehicle: 'v3', scenario: 'dpfPressure', feedback: 'positive', milesOffset: -7_150 },
  { id: 'mock-12', createdAt: '2026-09-10T15:33:00', vehicle: 'v6', scenario: 'oilPressure', feedback: null, milesOffset: -8_060 },
  { id: 'mock-13', createdAt: '2026-09-08T08:47:00', vehicle: 'v1', scenario: 'scrEfficiency', feedback: 'positive', milesOffset: -9_480 },
  { id: 'mock-14', createdAt: '2026-09-05T13:05:00', vehicle: 'v4', scenario: 'boostSensor', feedback: 'positive', milesOffset: -11_300 },
];

// In-memory feedback overrides so thumbs up/down persists while the app is open.
const feedbackOverrides = {};

function buildDiagnosis(record) {
  const scenario = SCENARIOS[record.scenario];
  const { baseMileage, ...vehicle } = VEHICLES[record.vehicle];
  return {
    id: record.id,
    createdAt: record.createdAt,
    technician: TECHNICIAN,
    vehicle,
    mileage: baseMileage + record.milesOffset,
    feedback: feedbackOverrides[record.id] ?? record.feedback,
    ...scenario,
    causes: scenario.causes.map((cause, i) => ({ ...cause, rank: i + 1 })),
  };
}

/** Flattened row shape used by HistoryTable. */
function toSummary(diagnosis) {
  return {
    id: diagnosis.id,
    createdAt: diagnosis.createdAt,
    vehicle: diagnosis.vehicle,
    faultCodes: diagnosis.faultCodes,
    topCause: diagnosis.causes[0].title,
    severity: diagnosis.severity,
    feedback: diagnosis.feedback,
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Data-access API — still mock-backed (Dashboard/History's recent-diagnoses
// list). getDiagnosis/runDiagnosis for the New Diagnosis/Results flow live in
// data/api.js now, backed by the real RAG pipeline.
// ---------------------------------------------------------------------------

/** All past diagnoses as table rows, newest first. */
export async function getDiagnosisHistory() {
  await wait(150);
  return HISTORY_RECORDS.map((r) => toSummary(buildDiagnosis(r)));
}

/** Most recent N diagnoses as table rows. */
export async function getRecentDiagnoses(limit = 5) {
  const rows = await getDiagnosisHistory();
  return rows.slice(0, limit);
}

/** Record technician feedback: 'positive' | 'negative', optional note. */
export async function submitFeedback(id, value, note = '') {
  await wait(150);
  feedbackOverrides[id] = value;
  return { ok: true, id, value, note };
}

/** Decode a single (already normalized) fault code. Returns null if unknown. */
export async function decodeFaultCode(code) {
  await wait(250);
  const entry = FAULT_CODE_LOOKUP[code];
  return entry ? { code, ...entry } : null;
}
