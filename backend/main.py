
from uuid import uuid4
from typing import Union

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.simulator import SystemSimulator


app = FastAPI(title="GA-Based PID Tuner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

systems = {}


class SimulationParams(BaseModel):
    dt: float = Field(gt=0)
    max_time: float = Field(gt=0)


class CaseStudy(BaseModel):
    system_name: str = Field(min_length=1)
    python_code: str = Field(min_length=1)

    system_description: str = ""
    control_objective: str = ""

    target: float
    num_states: int = Field(ge=1)
    num_inputs: int = Field(ge=1)

    input_channel: int = Field(ge=0)
    output_channel: int = Field(ge=0)

    min_ctrl: float
    max_ctrl: float

    trim_values: Union[float, list[float]]
    trim_ics: list[float]

    fixed_targets: dict[str, float]
    simulation_params: SimulationParams


@app.get("/")
def home():
    return {"message": "GA-Based PID Tuner API is running"}


@app.post("/api/v1/systems")
def create_system(payload: CaseStudy):

    if payload.min_ctrl >= payload.max_ctrl:
        raise HTTPException(
            status_code=422,
            detail="Invalid control limits",
        )

    if payload.input_channel >= payload.num_inputs:
        raise HTTPException(
            status_code=422,
            detail="Invalid input channel",
        )

    if payload.output_channel >= payload.num_states:
        raise HTTPException(
            status_code=422,
            detail="Invalid output channel",
        )

    if len(payload.trim_ics) != payload.num_states:
        raise HTTPException(
            status_code=422,
            detail="Initial state dimensions do not match",
        )

    if isinstance(payload.trim_values, list):
        trim_values = payload.trim_values
    else:
        trim_values = [payload.trim_values] * payload.num_inputs

    if len(trim_values) != payload.num_inputs:
        raise HTTPException(
            status_code=422,
            detail="Trim values dimensions do not match",
        )

    # Execute only trusted dynamics definitions.
    namespace = {"np": np}

    try:
        exec(payload.python_code, namespace)
        dynamics_func = namespace.get("dynamics")

        if not callable(dynamics_func):
            raise ValueError("dynamics(t, x, u) not found")

        system_config = {
            "dt": payload.simulation_params.dt,
            "max_time": payload.simulation_params.max_time,
            "target": payload.target,
            "num_states": payload.num_states,
            "num_inputs": payload.num_inputs,
            "input_channel": payload.input_channel,
            "output_channel": payload.output_channel,
            "min_ctrl": payload.min_ctrl,
            "max_ctrl": payload.max_ctrl,
            "trim_values": trim_values,
            "trim_ics": payload.trim_ics,
        }

        simulator = SystemSimulator(
            dynamics_func,
            system_config,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not initialize system: {exc}",
        )

    system_id = str(uuid4())

    systems[system_id] = {
        "simulator": simulator,
        "case_study": payload.model_dump(),
    }

    return {
        "system_id": system_id,
        "name": payload.system_name,
        "num_states": payload.num_states,
        "num_inputs": payload.num_inputs,
    }


@app.get("/api/v1/systems/{system_id}")
def get_system(system_id: str):

    system = systems.get(system_id)

    if system is None:
        raise HTTPException(
            status_code=404,
            detail="System not found",
        )

    case_study = system["case_study"]

    return {
        "system_id": system_id,
        "name": case_study["system_name"],
        "num_states": case_study["num_states"],
        "num_inputs": case_study["num_inputs"],
        "target": case_study["target"],
        "min_ctrl": case_study["min_ctrl"],
        "max_ctrl": case_study["max_ctrl"],
        "fixed_targets": case_study["fixed_targets"],
        "simulation_params": case_study["simulation_params"],
    }



import math

from src.ga_optimizer import GAOptimizer


class GASettings(BaseModel):
    population_size: int = Field(default=20, ge=4, le=200)
    generations: int = Field(default=30, ge=1, le=500)
    seed: int | None = 42
    max_wall_clock: float = Field(default=120, gt=0, le=3600)


class OptimizationRequest(BaseModel):
    param_ranges: dict[str, list[float]]
    weights: dict[str, float]
    fixed_targets: dict[str, float]
    ga_config: GASettings = Field(default_factory=GASettings)


def clean_ga_result(value):
    if isinstance(value, np.generic):
        return clean_ga_result(value.item())

    if isinstance(value, np.ndarray):
        return clean_ga_result(value.tolist())

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if isinstance(value, dict):
        return {
            key: clean_ga_result(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [clean_ga_result(item) for item in value]

    return value


@app.post("/api/v1/systems/{system_id}/optimize")
def optimize_system(system_id: str, request: OptimizationRequest):

    system = systems.get(system_id)

    if system is None:
        raise HTTPException(
            status_code=404,
            detail="System not found",
        )

    expected_gains = {"Kp", "Ki", "Kd"}
    expected_metrics = {
        "mse",
        "settling_time",
        "overshoot",
        "control_effort",
    }

    if set(request.param_ranges) != expected_gains:
        raise HTTPException(
            status_code=422,
            detail="Expected Kp, Ki and Kd search ranges",
        )

    for name, bounds in request.param_ranges.items():
        if len(bounds) != 2:
            raise HTTPException(
                status_code=422,
                detail=f"{name} must have two bounds",
            )

        lower, upper = bounds

        if (
            not math.isfinite(lower)
            or not math.isfinite(upper)
            or lower >= upper
        ):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid range for {name}",
            )

    if (
        set(request.weights) != expected_metrics
        or set(request.fixed_targets) != expected_metrics
    ):
        raise HTTPException(
            status_code=422,
            detail="All four performance metrics are required",
        )

    if any(
        not math.isfinite(value) or value < 0
        for value in request.weights.values()
    ):
        raise HTTPException(
            status_code=422,
            detail="Weights must be finite and non-negative",
        )

    if not any(value > 0 for value in request.weights.values()):
        raise HTTPException(
            status_code=422,
            detail="At least one weight must be positive",
        )

    if any(
        not math.isfinite(value) or value <= 0
        for value in request.fixed_targets.values()
    ):
        raise HTTPException(
            status_code=422,
            detail="Targets must be finite and positive",
        )

    try:
        optimizer = GAOptimizer(
            simulator=system["simulator"],
            config=request.ga_config.model_dump(),
        )

        result = optimizer.optimize_pid(
            weights=request.weights,
            param_ranges=request.param_ranges,
            fixed_targets=request.fixed_targets,
        )

        return clean_ga_result(result)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"GA optimization failed: {exc}",
        ) from exc
