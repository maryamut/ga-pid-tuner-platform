import NumberField from './NumberField'
import Icon from './Icon'

const METRICS = [
  ['mse', 'Mean squared error', 'MSE'],
  ['settling_time', 'Settling time', 'Time'],
  ['overshoot', 'Overshoot', 'OS'],
  ['control_effort', 'Control effort', 'Effort'],
]

export default function ConfigurationPanel({
  file, onFileChange, onLoadSystem, loadingSystem, busy, system,
  ranges, onRangeChange, targets, weights, onMetricChange,
  gaConfig, onGAChange, onReset, onRun,
}) {
  const locked = busy || !system

  return (
    <aside className="studio-sidebar" aria-label="Optimization configuration">
      <div className="studio-sidebar-heading">
        <div className="studio-heading-icon"><Icon name="sliders" size={19} /></div>
        <div><h2>Configuration</h2><p>Optimization parameters</p></div>
        <span className="studio-sidebar-counter">01—04</span>
      </div>

      <section className="studio-config-section">
        <div className="studio-section-heading"><span className="studio-section-index">01</span><h3>System definition</h3></div>
        <label className={`studio-file-pick ${busy ? 'is-disabled' : ''}`}>
          <Icon name="upload" size={18} />
          <span>{file ? 'Choose another JSON' : 'Choose case study JSON'}</span>
          <input type="file" accept=".json,application/json" disabled={busy}
            onChange={(event) => onFileChange(event.target.files?.[0] || null)} />
        </label>
        {file && <div className="studio-filename" title={file.name}><Icon name="file" size={15}/><span>{file.name}</span></div>}
        <button className="studio-btn studio-btn--secondary studio-load-btn" type="button" onClick={onLoadSystem}
          disabled={!file || busy}>
          {loadingSystem ? <span className="studio-btn-spinner" /> : <Icon name="layers" size={15}/>}
          {loadingSystem ? 'Loading system…' : 'Load system'}
        </button>
        {system ? (
          <div className="studio-model-summary" aria-live="polite">
            <div className="studio-model-name"><Icon name="checkCircle" size={16}/><strong>{system.name || 'Loaded system'}</strong></div>
            <div className="studio-model-details">
              <span>{system.num_states ?? '—'} states</span>
              <span>{system.num_inputs ?? '—'} inputs</span>
              <span>Target {system.target ?? '—'}</span>
            </div>
            <div className="studio-mini-muted">Control bounds: {system.min_ctrl ?? '—'} to {system.max_ctrl ?? '—'}</div>
          </div>
        ) : (
          <p className="studio-aside-note">Use a trusted example from <code>case_studies/json/</code>. JSON may contain executable system code.</p>
        )}
      </section>

      <fieldset className="studio-config-fieldset" disabled={locked}>
        <section className="studio-config-section">
          <div className="studio-section-heading"><span className="studio-section-index">02</span><h3>PID search space</h3><span className="studio-section-extra">Bounds</span></div>
          <div className="studio-bound-header"><span>GAIN</span><span>MINIMUM</span><span>MAXIMUM</span></div>
          {['Kp', 'Ki', 'Kd'].map((name) => (
            <div className="studio-bound-row" key={name}>
              <span className="studio-gain-name">{name}</span>
              <NumberField label={`${name} minimum`} compact value={ranges[name][0]} disabled={locked}
                onChange={(value) => onRangeChange(name, 0, value)} />
              <NumberField label={`${name} maximum`} compact value={ranges[name][1]} disabled={locked}
                onChange={(value) => onRangeChange(name, 1, value)} />
            </div>
          ))}
        </section>

        <section className="studio-config-section">
          <div className="studio-section-heading"><span className="studio-section-index">03</span><h3>Performance criteria</h3></div>
          <div className="studio-metric-header"><span>METRIC</span><span>TARGET ≤</span><span>WEIGHT</span></div>
          {METRICS.map(([key, label, short]) => (
            <div className="studio-metric-row" key={key}>
              <span title={label}>{label}</span>
              <NumberField label={`${short} target`} compact value={targets[key]} disabled={locked}
                onChange={(value) => onMetricChange('targets', key, value)} />
              <NumberField label={`${short} weight`} compact value={weights[key]} disabled={locked}
                onChange={(value) => onMetricChange('weights', key, value)} />
            </div>
          ))}
          <p className="studio-aside-note">A target is satisfied when the achieved metric is ≤ its threshold.</p>
        </section>

        <section className="studio-config-section">
          <div className="studio-section-heading"><span className="studio-section-index">04</span><h3>Genetic algorithm</h3></div>
          <div className="studio-ga-grid">
            <NumberField label="Population size" value={gaConfig.population_size} min={2} step={1} disabled={locked}
              onChange={(value) => onGAChange('population_size', value)} />
            <NumberField label="Generations" value={gaConfig.generations} min={1} step={1} disabled={locked}
              onChange={(value) => onGAChange('generations', value)} />
            <NumberField label="Random seed" value={gaConfig.seed} step={1} disabled={locked}
              onChange={(value) => onGAChange('seed', value)} />
            <NumberField label="Time limit (sec)" value={gaConfig.max_wall_clock} min={0.01} disabled={locked}
              onChange={(value) => onGAChange('max_wall_clock', value)} />
          </div>
        </section>

        <div className="studio-config-actions">
          <button type="button" className="studio-btn studio-btn--primary studio-run-btn" onClick={onRun} disabled={locked}>
            <Icon name="play" size={17} /> {busy ? 'Optimization running…' : 'Run optimization'}
          </button>
          <button type="button" className="studio-btn studio-btn--quiet" onClick={onReset} disabled={locked}>
            <Icon name="reset" size={15}/> Reset settings
          </button>
        </div>
      </fieldset>
    </aside>
  )
}
