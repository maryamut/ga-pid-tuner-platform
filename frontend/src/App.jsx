import { useState } from 'react'
import ConfigurationPanel from './components/ConfigurationPanel'
import AnalysisWorkspace from './components/AnalysisWorkspace'
import Icon from './components/Icon'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001'

const METRIC_KEYS = ['mse', 'settling_time', 'overshoot', 'control_effort']
const DEFAULT_RANGES = { Kp: [1, 50], Ki: [0.01, 5], Kd: [0.01, 10] }
const DEFAULT_WEIGHTS = { mse: 1, settling_time: 0.5, overshoot: 0.5, control_effort: 0.1 }
const DEFAULT_TARGETS = { mse: 0.05, settling_time: 1, overshoot: 1, control_effort: 0.1 }
const DEFAULT_GA = { population_size: 20, generations: 30, seed: 42, max_wall_clock: 120 }

async function readResponse(response) {
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : {} }
  catch { throw new Error(`Invalid API response (HTTP ${response.status}).`) }
  if (!response.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail || `Request failed (HTTP ${response.status}).`))
  }
  return data
}

function getPayload(ranges, targets, weights, gaConfig) {
  const outputRanges = {}
  for (const gain of ['Kp', 'Ki', 'Kd']) {
    const [rawMin, rawMax] = ranges[gain]
    if (rawMin === '' || rawMax === '' || !Number.isFinite(Number(rawMin)) || !Number.isFinite(Number(rawMax))) {
      throw new Error(`Please enter valid numeric bounds for ${gain}.`)
    }
    const min = Number(rawMin), max = Number(rawMax)
    if (min >= max) throw new Error(`${gain}: minimum must be smaller than maximum.`)
    outputRanges[gain] = [min, max]
  }
  const outputTargets = {}, outputWeights = {}
  for (const metric of METRIC_KEYS) {
    if (targets[metric] === '' || weights[metric] === '' || !Number.isFinite(Number(targets[metric])) || !Number.isFinite(Number(weights[metric]))) {
      throw new Error(`${metric}: enter valid target and weight values.`)
    }
    outputTargets[metric] = Number(targets[metric])
    outputWeights[metric] = Number(weights[metric])
    if (outputTargets[metric] < 0 || outputWeights[metric] < 0) throw new Error(`${metric}: target and weight cannot be negative.`)
  }
  if (!METRIC_KEYS.some((metric) => outputWeights[metric] > 0)) throw new Error('At least one metric weight must be greater than zero.')
  const ga = {}
  for (const key of ['population_size', 'generations', 'seed', 'max_wall_clock']) {
    if (gaConfig[key] === '' || !Number.isFinite(Number(gaConfig[key]))) throw new Error(`Please enter a valid ${key.replaceAll('_', ' ')}.`)
    ga[key] = Number(gaConfig[key])
  }
  if (!Number.isInteger(ga.population_size) || ga.population_size < 2) throw new Error('Population size must be an integer of at least 2.')
  if (!Number.isInteger(ga.generations) || ga.generations < 1) throw new Error('Generations must be a positive integer.')
  if (!Number.isInteger(ga.seed)) throw new Error('Random seed must be an integer.')
  if (ga.max_wall_clock <= 0) throw new Error('Time limit must be greater than zero seconds.')
  return { param_ranges: outputRanges, weights: outputWeights, fixed_targets: outputTargets, ga_config: ga }
}

function saveFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export default function App() {
  const [file, setFile] = useState(null)
  const [system, setSystem] = useState(null)
  const [ranges, setRanges] = useState(DEFAULT_RANGES)
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [gaConfig, setGaConfig] = useState(DEFAULT_GA)
  const [loadingSystem, setLoadingSystem] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [lastPayload, setLastPayload] = useState(null)
  const busy = loadingSystem || optimizing

  function invalidateResults() {
    setResult(null)
    setLastPayload(null)
    setError('')
    setActiveTab('overview')
  }
  function chooseFile(selected) {
    setFile(selected)
    setSystem(null)
    invalidateResults()
  }
  function updateRange(name, index, raw) {
    setRanges((previous) => ({ ...previous, [name]: previous[name].map((value, i) => i === index ? raw : value) }))
    invalidateResults()
  }
  function updateMetric(group, key, raw) {
    const setter = group === 'targets' ? setTargets : setWeights
    setter((previous) => ({ ...previous, [key]: raw }))
    invalidateResults()
  }
  function updateGA(key, raw) {
    setGaConfig((previous) => ({ ...previous, [key]: raw }))
    invalidateResults()
  }
  function resetSettings() {
    setRanges({ Kp: [...DEFAULT_RANGES.Kp], Ki: [...DEFAULT_RANGES.Ki], Kd: [...DEFAULT_RANGES.Kd] })
    setWeights({ ...DEFAULT_WEIGHTS })
    setTargets({ ...DEFAULT_TARGETS, ...(system?.fixed_targets || {}) })
    setGaConfig({ ...DEFAULT_GA })
    invalidateResults()
  }

  async function loadSystem() {
    if (!file || busy) return
    setLoadingSystem(true)
    setError('')
    setSystem(null)
    setResult(null)
    setLastPayload(null)
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Please select a .json case study file.')
      const caseStudy = JSON.parse(await file.text())
      const response = await fetch(`${API_URL}/api/v1/systems`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(caseStudy),
      })
      const created = await readResponse(response)
      if (!created.system_id) throw new Error('The API did not return a system_id.')
      const detailsResponse = await fetch(`${API_URL}/api/v1/systems/${encodeURIComponent(created.system_id)}`)
      const details = await readResponse(detailsResponse)
      setSystem({ ...details, system_id: created.system_id })
      setRanges({ Kp: [...DEFAULT_RANGES.Kp], Ki: [...DEFAULT_RANGES.Ki], Kd: [...DEFAULT_RANGES.Kd] })
      setWeights({ ...DEFAULT_WEIGHTS })
      setTargets({ ...DEFAULT_TARGETS, ...(details.fixed_targets || {}) })
      setGaConfig({ ...DEFAULT_GA })
      setActiveTab('overview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the selected system.')
    } finally { setLoadingSystem(false) }
  }

  async function runOptimization() {
    if (!system || busy) return
    let payload
    try { payload = getPayload(ranges, targets, weights, gaConfig) }
    catch (err) { setError(err.message); return }
    setOptimizing(true)
    setError('')
    setResult(null)
    setLastPayload(null)
    try {
      const response = await fetch(`${API_URL}/api/v1/systems/${encodeURIComponent(system.system_id)}/optimize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await readResponse(response)
      setResult(data)
      setLastPayload(payload)
      setActiveTab('overview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization request failed.')
    } finally { setOptimizing(false) }
  }

  const outputName = (system?.name || 'pid-run').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
  function exportJSON() {
    if (!result) return
    saveFile(`${outputName}-optimization.json`, JSON.stringify({ system: { name: system.name, system_id: system.system_id }, configuration: lastPayload, result }, null, 2), 'application/json;charset=utf-8')
  }
  function exportCSV() {
    if (!result) return
    const rows = [['Category', 'Name', 'Value', 'Target']]
    for (const gain of ['Kp', 'Ki', 'Kd']) rows.push(['PID gain', gain, result.controller_parameters?.[gain], ''])
    for (const key of METRIC_KEYS) rows.push(['Performance metric', key, result.achieved_metrics?.[key], lastPayload?.fixed_targets?.[key]])
    rows.push(['GA result', 'ga_cost', result.ga_cost, ''], ['GA result', 'stop_reason', result.stop_reason, ''], ['GA result', 'num_evaluations', result.num_evaluations, ''])
    saveFile(`${outputName}-results.csv`, '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
  }

  return <div className="studio-app">
    <header className="studio-topbar">
      <div className="studio-topbar-left"><div className="studio-logo"><Icon name="activity" size={23}/></div>
        <div className="studio-brand"><strong>PID Optimization Studio</strong><span>CONTROL ENGINEERING WORKSPACE</span></div>
        <span className="studio-topbar-divider"/><span className="studio-topbar-category">GA-powered controller tuning</span>
      </div>
      <div className="studio-topbar-right"><span className="studio-api-dot"/><span>FastAPI connected on request</span><span className="studio-app-version">V2 · UI REDESIGN</span></div>
    </header>
    <div className="studio-layout">
      <ConfigurationPanel
        file={file} onFileChange={chooseFile} onLoadSystem={loadSystem} loadingSystem={loadingSystem}
        busy={busy} system={system} ranges={ranges} onRangeChange={updateRange} targets={targets}
        weights={weights} onMetricChange={updateMetric} gaConfig={gaConfig} onGAChange={updateGA}
        onReset={resetSettings} onRun={runOptimization}
      />
      <AnalysisWorkspace system={system} loadingSystem={loadingSystem} optimizing={optimizing}
        error={error} onDismissError={() => setError('')} result={result}
        targets={lastPayload?.fixed_targets || targets} ranges={lastPayload?.param_ranges || ranges}
        activeTab={activeTab} onTabChange={setActiveTab}
        onExportJSON={exportJSON} onExportCSV={exportCSV}/>
    </div>
    <footer className="studio-footer"><span>GA-Based PID Controller Tuning Platform</span><span>Results depend on the supplied dynamics and GA configuration · Load trusted JSON only</span></footer>
  </div>
}
