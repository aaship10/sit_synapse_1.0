import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Play } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import VehicleInfoInput from '../components/VehicleInfoInput.jsx';
import CodeChipInput from '../components/CodeChipInput.jsx';
import SymptomInput from '../components/SymptomInput.jsx';
import MultiStepLoader, { DIAGNOSIS_STEPS } from '../components/MultiStepLoader.jsx';
import { runDiagnosis } from '../data/api.js';

const STEP_MS = 625; // 4 steps ≈ 2.5s total

function FormSection({ number, title, description, optional, children }) {
  return (
    <section className="panel">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[14px] font-medium text-text-secondary">{number}</span>
          <h2>{title}</h2>
          {optional && <span className="text-[14px] text-text-secondary">Optional</span>}
        </div>
        {description && <p className="mt-1 pl-7 text-[14px] text-text-secondary">{description}</p>}
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

function ChecklistItem({ done, label, detail, optional }) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-severity-safe" />
      ) : (
        <Circle size={18} className="mt-0.5 shrink-0 text-border" />
      )}
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{label}</div>
        <div className="truncate text-[13px] text-text-secondary">{detail || (optional ? 'Optional' : 'Required')}</div>
      </div>
    </li>
  );
}

export default function NewDiagnosis() {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [faultCodes, setFaultCodes] = useState([]);
  const [symptoms, setSymptoms] = useState('');
  const [mileage, setMileage] = useState('');
  const [loaderStep, setLoaderStep] = useState(null); // null = hidden
  const [error, setError] = useState('');
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const canSubmit = faultCodes.length > 0 && !!symptoms.trim() && loaderStep === null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoaderStep(0);
    const request = runDiagnosis({
      vehicle,
      faultCodes,
      symptoms: symptoms.trim(),
      mileage: mileage ? Number(mileage) : null,
    });

    DIAGNOSIS_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setLoaderStep(i + 1), STEP_MS * (i + 1)));
    });

    try {
      const [{ id }] = await Promise.all([
        request,
        new Promise((r) => timers.current.push(setTimeout(r, STEP_MS * DIAGNOSIS_STEPS.length + 300))),
      ]);
      navigate(`/diagnosis/${id}`);
    } catch (err) {
      timers.current.forEach(clearTimeout);
      setLoaderStep(null);
      setError(err.message || 'Could not reach the diagnosis backend. Is api.py running on port 8008?');
    }
  };

  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim() : '';

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader title="New diagnosis" description="Enter the active fault codes and observed symptoms. Vehicle details are optional." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <FormSection number="1" title="Vehicle information" optional description="Select the vehicle manually or decode it from the VIN.">
            <VehicleInfoInput onChange={setVehicle} />
          </FormSection>

          <FormSection number="2" title="Fault codes" description="J1939 SPN/FMI or OBD-II codes currently active or recently stored.">
            <label htmlFor="fault-codes" className="field-label">
              Fault codes <span className="text-severity-critical">*</span>
            </label>
            <CodeChipInput value={faultCodes} onChange={setFaultCodes} />
          </FormSection>

          <FormSection number="3" title="Symptoms" description="What the driver reported or what you observed.">
            <label htmlFor="symptoms" className="field-label">
              Symptoms <span className="text-severity-critical">*</span>
            </label>
            <SymptomInput value={symptoms} onChange={setSymptoms} />
          </FormSection>

          <FormSection number="4" title="Additional details" optional>
            <label htmlFor="mileage" className="field-label">
              Odometer reading
            </label>
            <div className="relative max-w-xs">
              <input
                id="mileage"
                type="number"
                min="0"
                inputMode="numeric"
                className="input pr-12 font-mono"
                placeholder="412880"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-text-secondary">mi</span>
            </div>
          </FormSection>
        </div>

        <aside className="panel lg:sticky lg:top-24">
          <div className="panel-header">
            <h3>Summary</h3>
          </div>
          <div className="px-6 py-5">
            <ul className="space-y-4">
              <ChecklistItem done={!!vehicle} label="Vehicle" detail={vehicleLabel} optional />
              <ChecklistItem
                done={faultCodes.length > 0}
                label="Fault codes"
                detail={faultCodes.length ? `${faultCodes.length} code${faultCodes.length > 1 ? 's' : ''} added` : ''}
              />
              <ChecklistItem done={!!symptoms.trim()} label="Symptoms" detail={symptoms.trim() && 'Described'} />
              <ChecklistItem done={!!mileage} label="Odometer" detail={mileage && `${Number(mileage).toLocaleString()} mi`} optional />
            </ul>

            <button type="submit" className="btn-primary mt-6 w-full" disabled={!canSubmit}>
              <Play size={16} />
              Run Diagnosis
            </button>
            {!canSubmit && loaderStep === null && !error && (
              <p className="mt-3 text-center text-[13px] text-text-secondary">Add at least one fault code and a symptom description to continue.</p>
            )}
            {error && <p className="mt-3 text-center text-[13px] text-severity-critical">{error}</p>}
          </div>
        </aside>
      </div>

      <MultiStepLoader open={loaderStep !== null} currentStep={loaderStep ?? 0} />
    </form>
  );
}
