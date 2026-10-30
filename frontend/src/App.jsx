
import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001'

const METRICS = [
  { key: 'mse', label: 'MSE' },
  { key: 'settling_time', label: 'Settling Time' },
  { key: 'overshoot', label: 'Overshoot' },
  { key: 'control_effort', label: 'Control Effort' },
]

const DEFAULT_RANGES = {
  Kp: [1, 50],
  Ki: [0.01, 5],
  Kd: [0.01, 10],
}

const DEFAULT_WEIGHTS = {
  mse: 1,
  settling_time: 0.5,
  overshoot: 0.5,
  control_effort: 0.1,
}

const DEFAULT_TARGETS = {
  mse: 0.05,
  settling_time: 1,
  overshoot: 1,
  control_effort: 0.1,
}

const DEFAULT_GA = {
  population_size: 20,
  generations: 30,
  seed: 42,
  max_wall_clock: 120,
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">
        {label}
      </span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
      />
    </label>
  )
}

function App() {
  const [file, setFile] = useState(null)
  const [system, setSystem] = useState(null)

  const [ranges, setRanges] = useState(DEFAULT_RANGES)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [gaConfig, setGaConfig] = useState(DEFAULT_GA)

  const [loadingSystem, setLoadingSystem] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  function updateRange(name, index, value) {
    setRanges((previous) => ({
      ...previous,
      [name]: previous[name].map((item, i) =>
        i === index ? value : item
      ),
    }))
    setResult(null)
  }

  function updateMetric(setter, name, value) {
    setter((previous) => ({
      ...previous,
      [name]: value,
    }))
    setResult(null)
  }

  async function readResponse(response) {
    const data = await response.json()

    if (!response.ok) {
      const detail = data.detail
      throw new Error(
        typeof detail === 'string'
          ? detail
          : JSON.stringify(detail || 'Request failed')
      )
    }

    return data
  }

  async function loadSystem() {
    if (!file) return

    setLoadingSystem(true)
    setError('')
    setSystem(null)
    setResult(null)

    try {
      const contents = await file.text()
      const caseStudy = JSON.parse(contents)

      const response = await fetch(`${API_URL}/api/v1/systems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseStudy),
      })

      const created = await readResponse(response)

      const detailsResponse = await fetch(
        `${API_URL}/api/v1/systems/${created.system_id}`
      )

      const details = await readResponse(detailsResponse)

      setSystem(details)
      setRanges({
        Kp: [...DEFAULT_RANGES.Kp],
        Ki: [...DEFAULT_RANGES.Ki],
        Kd: [...DEFAULT_RANGES.Kd],
      })
      setWeights({ ...DEFAULT_WEIGHTS })
      setTargets({
        ...DEFAULT_TARGETS,
        ...(details.fixed_targets || {}),
      })
      setGaConfig({ ...DEFAULT_GA })
    } catch (err) {
      setError(err.message || 'Failed to load system')
    } finally {
      setLoadingSystem(false)
    }
  }

  async function runOptimization() {
    if (!system || optimizing) return

    setOptimizing(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch(
        `${API_URL}/api/v1/systems/${system.system_id}/optimize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            param_ranges: ranges,
            weights,
            fixed_targets: targets,
            ga_config: gaConfig,
          }),
        }
      )

      const data = await readResponse(response)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Optimization failed')
    } finally {
      setOptimizing(false)
    }
  }

  function formatValue(value) {
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'number') return value.toFixed(4)
    return String(value)
  }

  const progress = result?.progress

  const progressData = (progress?.iteration || []).map(
    (generation, index) => ({
      generation,
      bestCost:
        progress.best_ga_cost?.[index] ??
        progress.best_cost?.[index] ??
        null,
      meanCost:
        progress.mean_ga_cost?.[index] ??
        progress.mean_cost?.[index] ??
        null,
      Kp: progress.Kp?.[index] ?? null,
      Ki: progress.Ki?.[index] ?? null,
      Kd: progress.Kd?.[index] ?? null,
    })
  )

  const scores = progress?.best_score_so_far || []
  const finalScore = scores.length
    ? scores[scores.length - 1]
    : null

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl space-y-8">

        <header>
          <h1 className="text-4xl font-bold">
            GA-Based PID Controller Tuner
          </h1>
          <p className="mt-3 text-slate-400">
            Genetic Algorithm Optimization Platform
          </p>
        </header>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            1. Load Dynamical System
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Select a trusted JSON case study such as BallBeam.json,
            DCMotor.json, or InvPendulum.json.
          </p>

          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setSystem(null)
              setResult(null)
              setError('')
            }}
            className="mt-5 block w-full rounded-lg border border-slate-600 p-3"
          />

          <button
            onClick={loadSystem}
            disabled={!file || loadingSystem || optimizing}
            className="mt-5 rounded-lg bg-blue-600 px-6 py-3 font-semibold disabled:opacity-50"
          >
            {loadingSystem ? 'Loading...' : 'Load System'}
          </button>

          {system && (
            <div className="mt-6 rounded-lg border border-emerald-700 bg-emerald-950 p-5">
              <p className="font-semibold text-emerald-300">
                System Loaded Successfully
              </p>

              <p className="mt-3">Name: {system.name}</p>
              <p>States: {system.num_states}</p>
              <p>Inputs: {system.num_inputs}</p>
              <p>Target: {system.target}</p>
              <p>
                Control Limits: {system.min_ctrl} to {system.max_ctrl}
              </p>
            </div>
          )}
        </section>

        {system && (
          <>
            <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                2. PID Search Ranges
              </h2>

              <div className="mt-6 space-y-5">
                {Object.entries(ranges).map(([name, bounds]) => (
                  <div key={name}>
                    <h3 className="mb-3 font-semibold text-blue-300">
                      {name}
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumberField
                        label="Minimum"
                        value={bounds[0]}
                        onChange={(value) =>
                          updateRange(name, 0, value)
                        }
                      />
                      <NumberField
                        label="Maximum"
                        value={bounds[1]}
                        onChange={(value) =>
                          updateRange(name, 1, value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                3. Target Metrics and Weights
              </h2>

              <div className="mt-6 space-y-5">
                {METRICS.map((metric) => (
                  <div
                    key={metric.key}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  >
                    <h3 className="mb-4 font-semibold">
                      {metric.label}
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumberField
                        label="Target"
                        value={targets[metric.key]}
                        onChange={(value) =>
                          updateMetric(setTargets, metric.key, value)
                        }
                      />
                      <NumberField
                        label="Weight"
                        value={weights[metric.key]}
                        onChange={(value) =>
                          updateMetric(setWeights, metric.key, value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                4. Genetic Algorithm Settings
              </h2>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ['population_size', 'Population Size'],
                  ['generations', 'Generations'],
                  ['seed', 'Random Seed'],
                  ['max_wall_clock', 'Max Wall Clock (seconds)'],
                ].map(([name, label]) => (
                  <NumberField
                    key={name}
                    label={label}
                    value={gaConfig[name] ?? ''}
                    onChange={(value) => {
                      setGaConfig((previous) => ({
                        ...previous,
                        [name]: value,
                      }))
                      setResult(null)
                    }}
                  />
                ))}
              </div>

              <button
                onClick={runOptimization}
                disabled={optimizing || loadingSystem}
                className="mt-8 rounded-lg bg-emerald-600 px-8 py-4 font-bold disabled:opacity-50"
              >
                {optimizing
                  ? 'Running GA Optimization...'
                  : 'Run Optimization'}
              </button>

              {optimizing && (
                <p className="mt-4 text-sm text-blue-300" role="status">
                  Optimizing PID gains. Results will appear when
                  the GA run finishes.
                </p>
              )}
            </section>
          </>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-800 bg-red-950 p-5 text-red-300"
          >
            {error}
          </div>
        )}

        {result && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold">
              5. Optimization Results
            </h2>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-xl font-semibold">
                  Best PID Gains
                </h3>
                <span className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  result.success
                    ? 'bg-emerald-900 text-emerald-300'
                    : 'bg-red-950 text-red-300'
                }`}>
                  {result.success ? 'Simulation Successful' : 'Simulation Failed'}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {['Kp', 'Ki', 'Kd'].map((name) => (
                  <div
                    key={name}
                    className="rounded-lg bg-slate-800 p-5 text-center"
                  >
                    <p className="text-sm text-slate-400">{name}</p>
                    <p className="mt-2 text-2xl font-bold text-blue-300">
                      {formatValue(result.controller_parameters?.[name])}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Stop Reason', result.stop_reason],
                  ['Evaluations', result.num_evaluations],
                  ['GA Cost', formatValue(result.ga_cost)],
                  ['Success Score', finalScore === null ? 'N/A' : `${finalScore}/100`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-700 p-4">
                    <p className="text-sm text-slate-400">{label}</p>
                    <p className="mt-2 font-semibold">{value ?? 'N/A'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="text-xl font-semibold">
                Achieved Metrics vs Targets
              </h3>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {METRICS.map((metric) => {
                  const achieved = result.achieved_metrics?.[metric.key]
                  const target = targets[metric.key]
                  const met = typeof achieved === 'number' && achieved <= target

                  return (
                    <div key={metric.key} className="rounded-lg bg-slate-800 p-5">
                      <p className="font-semibold">{metric.label}</p>
                      <p className="mt-3">
                        Achieved: {formatValue(achieved)}
                      </p>
                      <p className="text-slate-400">
                        Target: {formatValue(target)}
                      </p>
                      <p className={`mt-2 font-medium ${
                        met ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {met ? 'Target Met' : 'Target Not Met'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-6 text-xl font-semibold">
                GA Cost Progress
              </h3>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressData}>
                    <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                    <XAxis dataKey="generation" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Legend />
                    <Line
                      dataKey="bestCost"
                      name="Best GA Cost"
                      stroke="#38bdf8"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="meanCost"
                      name="Mean GA Cost"
                      stroke="#a78bfa"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-6 text-xl font-semibold">
                PID Gains Across Generations
              </h3>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressData}>
                    <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                    <XAxis dataKey="generation" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Legend />
                    <Line dataKey="Kp" stroke="#38bdf8" dot={false} />
                    <Line dataKey="Ki" stroke="#34d399" dot={false} />
                    <Line dataKey="Kd" stroke="#f59e0b" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}

export default App
