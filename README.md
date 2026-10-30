# GA-Based PID Controller Tuning

A platform for automatically tuning PID controllers on arbitrary dynamical systems using Genetic Algorithms (PyGAD). The core optimization and simulation engine (`src/`) is framework-agnostic Python. It is consumed by a Streamlit prototyping UI and is intended to be productized behind a FastAPI + React stack.

---

## Directory Layout

```
ga-tuner-pid/
├── src/                        # Optimization & simulation engine — read-only, framework-free
│   ├── ga_optimizer.py         # PyGAD wrapper, fitness, early stopping, progress tracking
│   ├── simulator.py            # PID closed-loop simulation + control-theory metrics
│   ├── callbacks.py            # Thread-local progress callback registry
│   └── logger.py               # Logging helpers
│
├── case_studies/
│   └── json/                   # Self-contained case studies (dynamics code + metadata)
│       ├── BallBeam.json
│       ├── DCMotor.json
│       └── InvPendulum.json
│
├── app.py                      # Streamlit reference / prototyping UI
└── README.md
```

---

## Quick Start — Streamlit Prototype

The Streamlit app is the fastest way to see the engine in action and to understand the expected user flow.

```bash
pip install streamlit numpy plotly pygad
streamlit run app.py
# → http://localhost:8501
```

You can either:

1. **Load a JSON case study** from `case_studies/json/` (recommended for first runs), or  
2. **Upload your own `.py` dynamics file**.

Then set PID search ranges, target metrics & weights, GA hyper-parameters, and click **Run GA Optimization**. After the run finishes you can inspect the best gains, generation-wise progress plots, and multi-trajectory closed-loop responses.

---

## The Engine (`src/`)

### What it does

1. **Loads** a user-provided dynamics function `dynamics(t, x, u)`.
2. **Simulates** closed-loop PID control (output feedback on a chosen channel) with control saturation and trim.
3. **Evaluates** a multi-objective cost (weighted sum of squared metrics: MSE, settling time, overshoot, control effort).
4. **Optimizes** the three PID gains (`Kp`, `Ki`, `Kd`) with a Genetic Algorithm (PyGAD).
5. **Tracks** rich progress: per-generation best/mean cost, baseline cost vs fixed targets, success score (0–100), cumulative NFE and wall-clock time, early-stop on score = 100 or wall-clock budget.

### How to use it in code

```python
from src.simulator import SystemSimulator
from src.ga_optimizer import GAOptimizer

# 1. Obtain a dynamics function (from JSON case study or .py file)
dynamics = ...   # callable(t, x, u) -> dx/dt

# 2. Configure the simulator
system_config = {
    "dt": 0.01,
    "max_time": 10.0,
    "target": 0.0,
    "num_states": 2,
    "num_inputs": 1,
    "input_channel": 0,
    "output_channel": 0,
    "min_ctrl": -0.5,
    "max_ctrl": 0.5,
    "trim_values": [0.0],
    "trim_ics": [1.0, 0.0],
}
simulator = SystemSimulator(dynamics, system_config)

# 3. Configure and run the GA
ga_config = {
    "population_size": 20,
    "generations": 30,
    "seed": 42,
}
optimizer = GAOptimizer(simulator, ga_config)

results = optimizer.optimize_pid(
    weights={"mse": 1.0, "settling_time": 0.5, "overshoot": 0.5, "control_effort": 0.1},
    param_ranges={"Kp": [1.0, 50.0], "Ki": [0.01, 5.0], "Kd": [0.01, 10.0]},
    fixed_targets={"mse": 0.05, "settling_time": 1.0, "overshoot": 1.0, "control_effort": 0.1},
)

# results["controller_parameters"]  → {"Kp": ..., "Ki": ..., "Kd": ...}
# results["achieved_metrics"]      → Dict of final metrics
# results["progress"]              → generation-wise history
# results["stop_reason"]           → "normal" | "score_100" | "wall_clock"
```

---

## Case Studies (`case_studies/json/`)

Each JSON file is self-contained: it embeds the Python dynamics source, system metadata, control limits, trim conditions, and suggested fixed targets.

| File              | States | Physics                          | Input              |
|-------------------|--------|----------------------------------|--------------------|
| `BallBeam.json`   | 2      | Ball position & velocity on beam | Beam angle (rad)   |
| `DCMotor.json`    | 2      | Motor speed & armature current   | Voltage (V)        |
| `InvPendulum.json`| 2      | Pendulum angle & rate            | Torque (N·m)       |

Contract of the embedded dynamics code:

```python
import numpy as np

def dynamics(t, x, u):
    """
    t : float
    x : np.ndarray, shape (n,)
    u : float or np.ndarray
    returns : np.ndarray, shape (n,)
    """
    ...
```

---

## Development Notes

- **Python version:** 3.10+
- **Core dependencies:** `numpy`, `pygad`
- **Streamlit UI dependencies:** `streamlit`, `plotly`
- No database is required; all system state is held in memory for the duration of a tuning session.

---

## License

Internal use only.

---

## Full-Stack Web Application

This repository includes a FastAPI backend and a React + Tailwind CSS frontend for the provided GA-based PID optimization engine.

### Run with Docker Compose

Requirements:
- Docker Desktop
- Docker Compose

From the project root:

```bash
docker compose up --build
```

Open:
- Frontend: http://localhost:5173
- FastAPI Documentation: http://localhost:8000/docs

### Main Workflow

1. Upload a trusted JSON file from `case_studies/json/`.
2. Review the loaded system configuration.
3. Configure PID gain search ranges (Kp, Ki, Kd).
4. Configure target metrics and optimization weights.
5. Set GA population size, generations, seed and time budget.
6. Click "Run Optimization".
7. Review best PID gains, achieved metrics, stop reason, success score and generation-wise progress charts.

### API Endpoints

- POST /api/v1/systems
- GET /api/v1/systems/{system_id}
- POST /api/v1/systems/{system_id}/optimize

### Architecture

The backend uses the original `src.simulator.SystemSimulator` and `src.ga_optimizer.GAOptimizer` without modifying the provided engine.

The frontend communicates with FastAPI using REST requests.
The API URL is configured through VITE_API_URL at frontend build time.

### Test Coverage

The main load-and-optimize workflow has been manually exercised with:
- BallBeam.json
- DCMotor.json
- InvPendulum.json

Optimization success depends on system dynamics, targets and GA settings. A successfully completed simulation does not necessarily mean all performance targets are met.

### Limitations and Assumptions

- System definitions are stored in memory and are lost when the backend restarts.
- GA optimization is executed synchronously.
- JSON dynamics definitions contain Python code that is executed by the backend.
- Only trusted dynamics definitions should be submitted. The application does not provide secure isolation for arbitrary untrusted code.
- The application is intended for local development and evaluation, not unrestricted public deployment.
