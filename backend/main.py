from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from gene_level_final_final_fix import GeneLevelEvaluator

from .gff_io import gff_text_to_dataframe
from .service import (
    BRANCHES,
    CDS_GENE_BIOTYPES,
    CDS_TRANSCRIPT_TYPES,
    DEFAULT_K,
    DEFAULT_K_VALUES,
    EXON_GENE_BIOTYPES,
    EXON_TRANSCRIPT_TYPES,
    GRAPH_METRICS,
    LeaderboardService,
    SOURCE_REPOSITORY_URL,
    STRATIFIER_LABELS,
    USE_STRAND,
)


class PlaygroundComputeRequest(BaseModel):
    pred_gff_text: str
    true_gff_text: str
    k_values: list[int] = Field(default_factory=lambda: DEFAULT_K_VALUES.copy())


class TemporaryUploadRequest(BaseModel):
    model_name: str
    pred_gff_text: str


ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"
ASSETS_DIR = STATIC_DIR / "assets"
EVALUATOR = GeneLevelEvaluator()
LEADERBOARD = LeaderboardService(ROOT_DIR)

app = FastAPI(title="GENATATOR Gene-level Leaderboard", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.on_event("startup")
def startup() -> None:
    LEADERBOARD.start(force=False)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def config() -> dict[str, Any]:
    return {
        "default_k": DEFAULT_K,
        "k_values": DEFAULT_K_VALUES,
        "branches": list(BRANCHES),
        "graph_metrics": list(GRAPH_METRICS.keys()),
        "available_stratifiers": [
            {"value": key, "label": STRATIFIER_LABELS[key]}
            for key in STRATIFIER_LABELS
        ],
        "source_repository_url": SOURCE_REPOSITORY_URL,
    }


@app.post("/api/playground/compute")
def playground_compute(payload: PlaygroundComputeRequest) -> dict[str, Any]:
    if not payload.pred_gff_text.strip():
        raise HTTPException(status_code=400, detail="Prediction GFF text is empty.")
    if not payload.true_gff_text.strip():
        raise HTTPException(status_code=400, detail="Ground-truth GFF text is empty.")

    try:
        pred_df = gff_text_to_dataframe(payload.pred_gff_text)
        true_df = gff_text_to_dataframe(payload.true_gff_text)
        exon_result = EVALUATOR.evaluate_gff_exon(
            pred_gff=pred_df,
            true_gff=true_df,
            k_values=payload.k_values,
            use_strand=USE_STRAND,
            gene_biotypes=EXON_GENE_BIOTYPES,
            transcript_types=EXON_TRANSCRIPT_TYPES,
        )
        cds_result = EVALUATOR.evaluate_gff_cds(
            pred_gff=pred_df,
            true_gff=true_df,
            k_values=payload.k_values,
            use_strand=USE_STRAND,
            gene_biotypes=CDS_GENE_BIOTYPES,
            transcript_types=CDS_TRANSCRIPT_TYPES,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def compact(result: dict[int, dict[str, Any]]) -> dict[int, dict[str, Any]]:
        cleaned: dict[int, dict[str, Any]] = {}
        for k, branch in result.items():
            cleaned[int(k)] = {
                "interval-level": {
                    key: value
                    for key, value in branch["interval-level"].items()
                    if key != "matched_pairs"
                },
                "segmentation-level": {
                    key: value
                    for key, value in branch["segmentation-level"].items()
                    if key != "matched_pairs"
                },
                "part-level": branch["part-level"],
            }
        return cleaned

    return {
        "k_values": payload.k_values,
        "exon": compact(exon_result),
        "cds": compact(cds_result),
    }


@app.get("/api/leaderboard/status")
def leaderboard_status() -> dict[str, Any]:
    return LEADERBOARD.status()


@app.post("/api/leaderboard/reload")
def leaderboard_reload() -> dict[str, Any]:
    return LEADERBOARD.start(force=True)


@app.get("/api/leaderboard/overview")
def leaderboard_overview() -> dict[str, Any]:
    return LEADERBOARD.overview()


@app.get("/api/leaderboard/full-metrics")
def leaderboard_full_metrics(
    branch: str = Query("exon"),
    k: int = Query(DEFAULT_K),
    model_ids: Optional[str] = Query(None),
) -> dict[str, Any]:
    if branch not in BRANCHES:
        raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
    ids = [item for item in (model_ids or "").split(",") if item.strip()] or None
    try:
        return LEADERBOARD.full_metrics(branch=branch, k=int(k), model_ids=ids)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/leaderboard/stratifier")
def leaderboard_stratifier(
    model_id: str,
    branch: str = Query("exon"),
    rule: str = Query("transcript_type"),
    k: int = Query(DEFAULT_K),
) -> dict[str, Any]:
    if branch not in BRANCHES:
        raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
    try:
        return LEADERBOARD.stratifier(branch=branch, k=int(k), model_id=model_id, rule=rule)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/leaderboard/genes")
def leaderboard_genes(
    branch: str = Query("exon"),
    query: str = Query(""),
    page: int = Query(1),
    page_size: int = Query(25),
) -> dict[str, Any]:
    if branch not in BRANCHES:
        raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
    return LEADERBOARD.genes(branch=branch, query=query, page=page, page_size=page_size)


@app.get("/api/leaderboard/gene/{gene_id}")
def leaderboard_gene_detail(
    gene_id: str,
    branch: str = Query("exon"),
    k: int = Query(DEFAULT_K),
    model_ids: Optional[str] = Query(None),
) -> dict[str, Any]:
    if branch not in BRANCHES:
        raise HTTPException(status_code=400, detail=f"Unknown branch: {branch}")
    ids = [item for item in (model_ids or "").split(",") if item.strip()] or None
    try:
        return LEADERBOARD.gene_detail(branch=branch, gene_id=gene_id, k=int(k), model_ids=ids)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/leaderboard/upload")
def leaderboard_upload(payload: TemporaryUploadRequest) -> dict[str, Any]:
    if not payload.pred_gff_text.strip():
        raise HTTPException(status_code=400, detail="Prediction GFF text is empty.")
    try:
        return LEADERBOARD.submit_temporary_model(
            model_name=payload.model_name,
            pred_gff_text=payload.pred_gff_text,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/", response_model=None)
def root() -> Response:
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"message": "Frontend build not found."}, status_code=503)


@app.get("/{full_path:path}", response_model=None)
def spa_fallback(full_path: str) -> Response:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found.")

    candidate = STATIC_DIR / full_path
    if candidate.exists() and candidate.is_file():
        return FileResponse(candidate)

    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"message": "Frontend build not found."}, status_code=503)
