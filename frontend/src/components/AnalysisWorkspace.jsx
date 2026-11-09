import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import Icon from './Icon'

const METRICS = [
  ['mse', 'Mean squared error', 'MSE'],
  ['settling_time', 'Settling time', 'Settling time'],
  ['overshoot', 'Overshoot', 'Overshoot'],
  ['control_effort', 'Control effort', 'Control effort'],
]

function formatNum(value, digits = 4) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  if (number === 0) return '0'
  if (Math.abs(number) < 0.0001 || Math.abs(number) >= 100000) return number.toExponential(2)
  return number.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function StatCard({ label, value, note, accent }) {
  return <div className={`studio-stat ${accent ? `studio-stat--${accent}` : ''}`}>
    <span className="studio-stat-label">{label}</span>
    <strong title={String(value ?? '—')}>{value ?? '—'}</strong>
    <small>{note}</small>
  </div>
}

function Panel({ title, subtitle, aside, children, className = '' }) {
  return <section className={`studio-analysis-panel ${className}`}>
    <div className="studio-analysis-panel-header">
      <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      {aside}
    </div>
    {children}
  </section>
}

const commonAxis = {
  tick: { fill: '#8290a2', fontSize: 11 },
  tickLine: false,
  axisLine: false,
}

function HistoryChart({ data, mode = 'cost', ranges, normalized = false }) {
  if (!data.length) return <div className="studio-chart-empty">No generation history was returned by the optimizer.</div>

  const singlePoint = data.length === 1
  const source = normalized && mode === 'gains'
    ? data.map((point) => {
      const normalizedPoint = { ...point }
      for (const name of ['Kp', 'Ki', 'Kd']) {
        const [min, max] = ranges[name].map(Number)
        normalizedPoint[name] = Number.isFinite(point[name]) && max > min
          ? ((point[name] - min) / (max - min)) * 100 : null
      }
      return normalizedPoint
    })
    : data

  const curves = mode === 'cost'
    ? [{ key: 'bestCost', name: 'Best cost', color: '#2867df' }, { key: 'meanCost', name: 'Mean cost', color: '#8e6ad8' }]
    : [{ key: 'Kp', name: 'Kp', color: '#2867df' }, { key: 'Ki', name: 'Ki', color: '#0ba691' }, { key: 'Kd', name: 'Kd', color: '#d69525' }]

  const available = curves.filter(({ key }) => source.some((point) => typeof point[key] === 'number' && Number.isFinite(point[key])))
  if (!available.length) return <div className="studio-chart-empty">No numeric {mode === 'cost' ? 'cost' : 'gain'} values were provided.</div>

  return <div className="studio-chart">
    <ResponsiveContainer width="100%" height="100%" minHeight={250}>
      <LineChart data={source} margin={{ top: 16, right: 18, left: 0, bottom: 6 }}>
        <CartesianGrid vertical={false} stroke="#e8edf5" strokeDasharray="3 4" />
        <XAxis dataKey="generation" {...commonAxis} tickMargin={10} label={{ value: 'Generation', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#8b98a9' }} height={38} />
        <YAxis {...commonAxis} tickMargin={8} width={55} domain={normalized ? [0, 100] : ['auto', 'auto']} tickFormatter={(v) => formatNum(v, 2)} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: '1px solid #dfe6ef', boxShadow: '0 10px 28px rgba(29,49,80,.12)', fontSize: 12 }}
          formatter={(value, label) => [typeof value === 'number' ? `${formatNum(value, 5)}${normalized ? '%' : ''}` : '—', label]}
          labelFormatter={(label) => `Generation ${label}`}
        />
        <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        {available.map((curve) => <Line key={curve.key} type="linear" dataKey={curve.key}
          name={curve.name} stroke={curve.color} strokeWidth={2.4}
          connectNulls={false} isAnimationActive={false}
          dot={singlePoint ? { r: 4.5, strokeWidth: 2 } : false}
          activeDot={{ r: 5 }} />)}
      </LineChart>
    </ResponsiveContainer>
    {singlePoint && <p className="studio-chart-note"><Icon name="info" size={13}/> Optimization history contains only one generation. The single data point is shown without an invented trend.</p>}
    {normalized && mode === 'gains' && <p className="studio-chart-note"><Icon name="info" size={13}/> Each gain is normalized to its configured search bounds (0–100%). Tooltips show the normalized values.</p>}
  </div>
}

function MetricsTable({ achieved, targets }) {
  return <div className="studio-table-scroll"><table className="studio-metrics-table">
    <thead><tr><th>Metric</th><th>Achieved</th><th>Target ≤</th><th>Assessment</th></tr></thead>
    <tbody>{METRICS.map(([key, label]) => {
      const value = achieved?.[key]
      const valid = typeof value === 'number' && Number.isFinite(value)
      const target = Number(targets[key])
      const met = valid && value <= target
      return <tr key={key}><td className="studio-table-name">{label}</td>
        <td className="studio-numeric">{formatNum(value)}</td>
        <td className="studio-numeric">{formatNum(target)}</td>
        <td><span className={`studio-metric-status ${!valid ? 'is-na' : met ? 'is-pass' : 'is-fail'}`}>
          {valid ? met ? 'Target met' : 'Not met' : 'Unavailable'}</span></td></tr>
    })}</tbody>
  </table></div>
}

export default function AnalysisWorkspace({ system, loadingSystem, optimizing, error, onDismissError,
  result, targets, ranges, activeTab, onTabChange, onExportJSON, onExportCSV }) {
  const [normalized, setNormalized] = useState(true)

  const progressData = useMemo(() => {
    const p = result?.progress || {}
    const iterations = Array.isArray(p.iteration) ? p.iteration : []
    return iterations.map((generation, i) => ({
      generation,
      bestCost: p.best_ga_cost?.[i] ?? p.best_cost?.[i] ?? null,
      meanCost: p.mean_ga_cost?.[i] ?? p.mean_cost?.[i] ?? null,
      Kp: p.Kp?.[i] ?? null, Ki: p.Ki?.[i] ?? null, Kd: p.Kd?.[i] ?? null,
    }))
  }, [result])

  const scores = result?.progress?.best_score_so_far || []
  const finalScore = scores.length ? scores[scores.length - 1] : null
  const achieved = result?.achieved_metrics || {}
  const metricsAvailable = METRICS.filter(([key]) => typeof achieved[key] === 'number' && Number.isFinite(achieved[key])).length
  const metCount = METRICS.filter(([key]) => typeof achieved[key] === 'number' && Number.isFinite(achieved[key]) && achieved[key] <= Number(targets[key])).length
  const allTargets = metricsAvailable === METRICS.length && metCount === METRICS.length

  const phase = optimizing ? 'running' : loadingSystem ? 'loading' : result ? 'completed' : system ? 'ready' : 'empty'
  const phaseLabel = {
    running: 'Optimization running', loading: 'Loading model', completed: 'Request completed', ready: 'Ready to optimize', empty: 'Awaiting system',
  }[phase]

  return <main className="studio-workspace">
    <div className="studio-workspace-heading">
      <div className="studio-workspace-heading-text">
        <div className="studio-eyebrow">WORKSPACE / {system ? 'ACTIVE MODEL' : 'NO MODEL SELECTED'}</div>
        <h1>{system?.name || 'Optimization workspace'}</h1>
        <p>{system ? `${system.num_states ?? '—'} system states · ${system.num_inputs ?? '—'} inputs · Target ${system.target ?? '—'}` : 'Load a trusted JSON system to configure and execute PID tuning.'}</p>
      </div>
      <div className={`studio-phase studio-phase--${phase}`} aria-live="polite"><span className="studio-phase-dot"/>{phaseLabel}</div>
    </div>

    {error && <div className="studio-alert" role="alert"><Icon name="alert" size={19}/><div><strong>Operation could not be completed</strong><p>{error}</p></div><button type="button" aria-label="Dismiss error" onClick={onDismissError}><Icon name="close" size={17}/></button></div>}

    {phase === 'empty' && <div className="studio-empty-state">
      <div className="studio-empty-icon"><Icon name="activity" size={31}/></div>
      <div className="studio-eyebrow">START A NEW ANALYSIS</div>
      <h2>Engineering-grade PID optimization</h2>
      <p>Import a system definition, set the PID search ranges and performance targets, then execute the genetic algorithm. This workspace keeps the technical outputs at the center of the workflow.</p>
      <div className="studio-steps"><div><b>01</b><strong>Load system</strong><span>Select a trusted JSON case study</span></div><div><b>02</b><strong>Configure GA</strong><span>Set bounds, weights and targets</span></div><div><b>03</b><strong>Analyze results</strong><span>Inspect gains, metrics and convergence</span></div></div>
      <div className="studio-empty-note"><Icon name="info" size={15}/> Example files: BallBeam.json · DCMotor.json · InvPendulum.json</div>
    </div>}

    {phase === 'loading' && <div className="studio-processing" role="status"><span className="studio-big-spinner"/><h2>Loading model definition</h2><p>Validating the JSON and requesting model metadata from FastAPI.</p></div>}

    {phase === 'ready' && <div className="studio-ready-state">
      <div className="studio-ready-hero"><div className="studio-ready-icon"><Icon name="checkCircle" size={24}/></div><div><span className="studio-eyebrow">MODEL INITIALIZED</span><h2>Ready to run optimization</h2><p>Adjust search bounds, metric thresholds and GA hyperparameters in the configuration panel. Results will replace this guidance after the request completes.</p></div></div>
      <div className="studio-ready-grid"><div className="studio-ready-tile"><Icon name="sliders"/><strong>Search space</strong><span>Review Kp / Ki / Kd minimum and maximum</span></div><div className="studio-ready-tile"><Icon name="target"/><strong>Objectives</strong><span>Set desired performance thresholds and weights</span></div><div className="studio-ready-tile"><Icon name="chart"/><strong>Analysis</strong><span>Compare controller gains and generation history</span></div></div>
    </div>}

    {phase === 'running' && <div className="studio-processing" role="status">
      <span className="studio-big-spinner"/><span className="studio-eyebrow">GENETIC ALGORITHM</span><h2>Optimization is running</h2>
      <p>The backend is evaluating candidate PID controllers. Results will appear after the optimization request finishes.</p>
      <div className="studio-indeterminate-track"><div/></div>
      <div className="studio-processing-note"><Icon name="info" size={16}/> Live generation progress is not exposed by the current API. This indicator shows activity, not a measured percentage.</div>
    </div>}

    {phase === 'completed' && <>
      <div className="studio-results-head">
        <div><span className="studio-eyebrow">LATEST OPTIMIZATION RUN</span><h2>Analysis results</h2><p>Optimization execution and control performance are reported separately.</p></div>
        <div className="studio-results-actions"><button type="button" className="studio-btn studio-btn--secondary" onClick={onExportJSON}><Icon name="download" size={15}/> JSON</button><button type="button" className="studio-btn studio-btn--secondary" onClick={onExportCSV}><Icon name="download" size={15}/> CSV</button></div>
      </div>
      <div className="studio-result-badges">
        <span className={`studio-result-badge ${result.success ? 'is-good' : 'is-warning'}`}><Icon name={result.success ? 'checkCircle' : 'alert'} size={15}/>{result.success ? 'Simulation completed successfully' : 'Simulation reported failure'}</span>
        <span className={`studio-result-badge ${allTargets ? 'is-good' : metCount ? 'is-warning' : 'is-neutral'}`}><Icon name="target" size={15}/>{metCount} / {METRICS.length} targets met</span>
      </div>
      <div className="studio-stat-grid">
        <StatCard label="Best score" value={finalScore === null ? '—' : `${formatNum(finalScore, 2)} / 100`} note="GA target score" accent="blue"/>
        <StatCard label="GA cost" value={formatNum(result.ga_cost, 5)} note="Objective function"/>
        <StatCard label="Evaluations" value={formatNum(result.num_evaluations, 0)} note="Fitness evaluations"/>
        <StatCard label="Stop reason" value={result.stop_reason || '—'} note="Optimizer termination"/>
      </div>
      <div className="studio-result-tabs" role="tablist" aria-label="Optimization results">
        {[['overview', 'Overview', 'layers'], ['convergence', 'Convergence', 'chart'], ['metrics', 'Performance metrics', 'target']].map(([key, label, icon]) =>
          <button key={key} role="tab" aria-selected={activeTab === key} type="button" className={activeTab === key ? 'is-active' : ''} onClick={() => onTabChange(key)}><Icon name={icon} size={16}/>{label}</button>)}
      </div>
      {activeTab === 'overview' && <div className="studio-results-content">
        <Panel title="Optimized PID controller" subtitle="Best gain combination returned by the GA" aside={<span className="studio-plain-chip">PID PARAMETERS</span>}>
          <div className="studio-gain-grid">{['Kp', 'Ki', 'Kd'].map((name, index) => <div className="studio-gain-card" key={name}><span className="studio-gain-marker" style={{ background: ['#2867df', '#0ba691', '#d69525'][index] }}/><div className="studio-gain-title">{({ Kp: 'Proportional', Ki: 'Integral', Kd: 'Derivative' })[name]}</div><div className="studio-gain-key">{name}</div><strong>{formatNum(result.controller_parameters?.[name], 5)}</strong></div>)}</div>
        </Panel>
        <div className="studio-two-panels">
          <Panel title="Convergence snapshot" subtitle="GA cost vs. generation"><HistoryChart data={progressData} mode="cost" ranges={ranges}/></Panel>
          <Panel title="Performance summary" subtitle="Measured values compared to thresholds"><MetricsTable achieved={achieved} targets={targets}/><div className="studio-target-foot"><Icon name="target" size={16}/>{metricsAvailable} of 4 metrics available · {metCount} thresholds satisfied</div></Panel>
        </div>
      </div>}
      {activeTab === 'convergence' && <div className="studio-results-content">
        <Panel title="GA cost history" subtitle="Best and mean objective values per recorded generation" aside={<span className="studio-plain-chip">{progressData.length} generations recorded</span>}><HistoryChart data={progressData} mode="cost" ranges={ranges}/></Panel>
        <Panel title="PID gain evolution" subtitle="Explore how the best gains change between generations" aside={<div className="studio-chart-toggle"><button type="button" className={!normalized ? 'is-current' : ''} onClick={() => setNormalized(false)}>Absolute</button><button type="button" className={normalized ? 'is-current' : ''} onClick={() => setNormalized(true)}>Normalized</button></div>}><HistoryChart data={progressData} mode="gains" ranges={ranges} normalized={normalized}/></Panel>
      </div>}
      {activeTab === 'metrics' && <div className="studio-results-content">
        <Panel title="Performance vs. engineering targets" subtitle="All four criteria use achieved ≤ target"><MetricsTable achieved={achieved} targets={targets}/></Panel>
        <div className="studio-insight-strip"><Icon name="info" size={18}/><p><strong>Interpretation:</strong> A completed optimization or simulation does not guarantee that the target constraints were satisfied. Check every metric independently; the score summarizes the GA's objective, while the table reports threshold compliance.</p></div>
      </div>}
    </>}
  </main>
}
