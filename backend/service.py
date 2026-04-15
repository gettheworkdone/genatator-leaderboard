from __future__ import annotations

import copy
import json
import math
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from queue import Queue
from typing import Any, Iterable, Optional
from urllib.error import URLError
from urllib.request import urlopen

import pandas as pd

from gene_level_final_final_fix import GeneLevelEvaluator

from .gff_io import gff_text_to_dataframe


SOURCE_REPOSITORY_URL = "https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions"
SOURCE_REPOSITORY_RAW_BASE = (
    "https://raw.githubusercontent.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions/main"
)
DEFAULT_K_VALUES = list(range(0, 501))
DEFAULT_K = 250
USE_STRAND = True
EXON_GENE_BIOTYPES = ["protein_coding", "lncRNA"]
EXON_TRANSCRIPT_TYPES = ["mRNA", "lnc_RNA"]
CDS_GENE_BIOTYPES = ["protein_coding"]
CDS_TRANSCRIPT_TYPES = ["mRNA"]
BRANCHES = ("exon", "cds")
STRATIFIER_LABELS = {
    "strand": "Strand",
    "chromosome": "Chromosome",
    "transcript_type": "Transcript type",
}
GRAPH_METRICS = {
    "interval_f1": ("interval-level", "f1"),
    "interval_precision": ("interval-level", "precision"),
    "interval_recall": ("interval-level", "recall"),
    "interval_mi": ("interval-level", "mi"),
    "segmentation_f1": ("segmentation-level", "f1"),
    "segmentation_precision": ("segmentation-level", "precision"),
    "segmentation_recall": ("segmentation-level", "recall"),
    "segmentation_mi": ("segmentation-level", "mi"),
}


def _slugify(text: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in text.strip())
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned or "model"


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return int(numeric)


@dataclass
class ModelBundle:
    model_id: str
    display_name: str
    temporary: bool
    branch_results: dict[str, dict[int, dict[str, object]]]
    stratifier: dict[str, dict[str, dict[str, dict[int, dict[str, object]]]]]
    detailed: dict[str, dict[str, dict[str, object]]]
    prediction_index: dict[str, dict[str, object]]
    source_file: str | None = None


@dataclass
class ServiceState:
    running: bool = False
    ready: bool = False
    missing_ground_truth: bool = False
    stage: str = "idle"
    message: str = "Waiting for initialization."
    error: str | None = None
    current_model: str | None = None
    total_models: int = 0
    completed_models: int = 0
    upload_queue_length: int = 0
    upload_current: str | None = None
    launched_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "running": self.running,
            "ready": self.ready,
            "missing_ground_truth": self.missing_ground_truth,
            "stage": self.stage,
            "message": self.message,
            "error": self.error,
            "current_model": self.current_model,
            "total_models": self.total_models,
            "completed_models": self.completed_models,
            "upload_queue_length": self.upload_queue_length,
            "upload_current": self.upload_current,
            "launched_at": self.launched_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class LeaderboardService:
    def __init__(self, root_dir: Path) -> None:
        self.root_dir = root_dir
        self.data_dir = self.root_dir / "leaderboard_data"
        self.ground_truth_path = self.data_dir / "ground_truth" / "chr20.gff"
        self.predictions_dir = self.data_dir / "predictions"
        self.mapping_path = self.data_dir / "model_name_mapping.json"
        self.remote_cache_dir = self.data_dir / ".remote_predictions_cache"
        self._display_name_mapping: dict[str, Any] = {}

        self.evaluator = GeneLevelEvaluator()
        self._lock = threading.Lock()
        self._state = ServiceState()
        self._permanent_models: dict[str, ModelBundle] = {}
        self._temporary_models: dict[str, ModelBundle] = {}
        self._ground_truth_indices: dict[str, dict[str, object]] = {}
        self._initializer_started = False
        self._upload_queue: Queue[dict[str, object]] = Queue()
        threading.Thread(target=self._upload_worker, daemon=True).start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self, force: bool = False) -> dict[str, object]:
        with self._lock:
            if self._state.running:
                return self._state.to_dict()
            if self._initializer_started and not force and self._state.ready:
                return self._state.to_dict()
            if force:
                self._permanent_models = {}
                self._temporary_models = {}
                self._ground_truth_indices = {}
            self._initializer_started = True
            self._state = ServiceState(
                running=True,
                ready=False,
                stage="initializing",
                message="Initializing leaderboard data and computing metrics.",
                started_at=time.time(),
            )
            self._state.upload_queue_length = self._upload_queue.qsize()
        threading.Thread(target=self._initialize, daemon=True).start()
        return self.status()

    def status(self) -> dict[str, object]:
        with self._lock:
            return self._state.to_dict()

    def overview(self) -> dict[str, object]:
        with self._lock:
            status = self._state.to_dict()
            models = [
                self._serialize_model_overview(bundle)
                for bundle in self._ordered_bundles_locked()
            ]
        return {
            **status,
            "default_k": DEFAULT_K,
            "k_values": DEFAULT_K_VALUES,
            "branches": list(BRANCHES),
            "graph_metrics": list(GRAPH_METRICS.keys()),
            "available_stratifiers": [
                {"value": key, "label": STRATIFIER_LABELS[key]}
                for key in STRATIFIER_LABELS
            ],
            "models": models,
            "source_repository_url": SOURCE_REPOSITORY_URL,
        }

    def full_metrics(
        self,
        branch: str,
        k: int,
        model_ids: Optional[list[str]] = None,
    ) -> dict[str, object]:
        bundle_list = self._selected_bundles(model_ids)
        rows = [self._serialize_full_metric_row(bundle, branch, k) for bundle in bundle_list]
        return {"branch": branch, "k": int(k), "rows": rows}

    def stratifier(
        self,
        branch: str,
        k: int,
        model_id: str,
        rule: str,
    ) -> dict[str, object]:
        bundle = self._get_bundle(model_id)
        stratifier_tree = bundle.stratifier.get(branch, {})
        if rule not in stratifier_tree:
            raise KeyError(f"Stratification rule '{rule}' is not available for branch '{branch}'.")
        rows: list[dict[str, object]] = []
        for group_name, per_k in stratifier_tree[rule].items():
            metrics = per_k[int(k)]
            rows.append(
                {
                    "group": group_name,
                    "interval_precision": metrics["interval-level"]["precision"],
                    "interval_recall": metrics["interval-level"]["recall"],
                    "interval_f1": metrics["interval-level"]["f1"],
                    "interval_mi": metrics["interval-level"]["mi"],
                    "segmentation_precision": metrics["segmentation-level"]["precision"],
                    "segmentation_recall": metrics["segmentation-level"]["recall"],
                    "segmentation_f1": metrics["segmentation-level"]["f1"],
                    "segmentation_mi": metrics["segmentation-level"]["mi"],
                    "part_precision": metrics["part-level"]["precision"],
                    "part_recall": metrics["part-level"]["recall"],
                    "part_f1": metrics["part-level"]["f1"],
                }
            )
        rows.sort(key=lambda item: (-float(item["segmentation_f1"]), str(item["group"])))
        return {
            "branch": branch,
            "k": int(k),
            "model": {"id": bundle.model_id, "display_name": bundle.display_name},
            "rule": rule,
            "rows": rows,
        }

    def genes(
        self,
        branch: str,
        query: str = "",
        page: int = 1,
        page_size: int = 25,
    ) -> dict[str, object]:
        index = self._ground_truth_indices.get(branch)
        if index is None:
            return {"branch": branch, "total": 0, "page": 1, "page_size": page_size, "items": []}

        items = index["gene_summaries"]
        query_norm = query.strip().lower()
        if query_norm:
            filtered = []
            for item in items:
                haystack = " ".join(
                    [
                        item["gene_id"],
                        item["chromosome"],
                        item["strand"],
                        " ".join(item["transcript_ids"]),
                        " ".join(item["transcript_types"]),
                    ]
                ).lower()
                if query_norm in haystack:
                    filtered.append(item)
            items = filtered

        page = max(int(page), 1)
        page_size = max(min(int(page_size), 100), 1)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "branch": branch,
            "total": len(items),
            "page": page,
            "page_size": page_size,
            "items": items[start:end],
        }

    def gene_detail(
        self,
        branch: str,
        gene_id: str,
        k: int,
        model_ids: Optional[list[str]] = None,
    ) -> dict[str, object]:
        index = self._ground_truth_indices.get(branch)
        if index is None or gene_id not in index["genes"]:
            raise KeyError(f"Ground-truth gene '{gene_id}' was not found for branch '{branch}'.")

        gene_data = copy.deepcopy(index["genes"][gene_id])
        selected_models = self._selected_bundles(model_ids)
        selected_k = int(k)

        for transcript in gene_data["transcripts"]:
            tx_id = transcript["transcript_id"]
            matches: list[dict[str, object]] = []
            for bundle in selected_models:
                detail_entry = bundle.detailed.get(branch, {}).get(tx_id)
                if detail_entry is None:
                    continue
                interval_map = {
                    item["pred_id"]: safe_value
                    for item in detail_entry["interval-level"].get("predictions", [])
                    if (safe_value := _safe_int(item.get("min_k"))) is not None
                }
                segmentation_map = {
                    item["pred_id"]: safe_value
                    for item in detail_entry["segmentation-level"].get("predictions", [])
                    if (safe_value := _safe_int(item.get("min_k"))) is not None
                }
                for pred_id in sorted(set(interval_map) | set(segmentation_map)):
                    pred_meta = bundle.prediction_index.get(pred_id, {})
                    interval_min_k = interval_map.get(pred_id)
                    segmentation_min_k = segmentation_map.get(pred_id)
                    min_k_candidates = [value for value in (interval_min_k, segmentation_min_k) if value is not None]
                    min_k = min(min_k_candidates) if min_k_candidates else None
                    matches.append(
                        {
                            "model_id": bundle.model_id,
                            "model_name": bundle.display_name,
                            "temporary": bundle.temporary,
                            "pred_id": pred_id,
                            "chromosome": pred_meta.get("chromosome"),
                            "start": pred_meta.get("start"),
                            "end": pred_meta.get("end"),
                            "strand": pred_meta.get("strand"),
                            "exon_segments": pred_meta.get("exon_segments", []),
                            "cds_segments": pred_meta.get("cds_segments", []),
                            "min_k": min_k,
                            "matched_at_k": min_k is not None and min_k <= selected_k,
                        }
                    )
            matches.sort(
                key=lambda item: (
                    item["min_k"] if item["min_k"] is not None else 10**9,
                    item["model_name"].lower(),
                    item["pred_id"],
                )
            )
            transcript["matched_predictions"] = matches
            transcript["matched_prediction_count"] = len(matches)

        return {"branch": branch, "k": selected_k, "gene": gene_data}

    def submit_temporary_model(self, model_name: str, pred_gff_text: str) -> dict[str, object]:
        display_name = model_name.strip() or f"Temporary model {uuid.uuid4().hex[:8]}"
        job = {
            "job_id": uuid.uuid4().hex,
            "model_name": display_name,
            "pred_gff_text": pred_gff_text,
        }
        self._upload_queue.put(job)
        with self._lock:
            self._state.upload_queue_length = self._upload_queue.qsize()
        return {
            "job_id": job["job_id"],
            "queued": True,
            "message": "Temporary model submitted. It will appear in the leaderboard when processing finishes.",
        }

    # ------------------------------------------------------------------
    # Initialization and uploads
    # ------------------------------------------------------------------

    def _initialize(self) -> None:
        try:
            if not self.ground_truth_path.exists():
                self._set_state(
                    running=False,
                    ready=False,
                    missing_ground_truth=True,
                    stage="missing-ground-truth",
                    message=(
                        "Ground-truth file not found. Add 'leaderboard_data/ground_truth/chr20.gff' "
                        "and restart or reload the Space."
                    ),
                    finished_at=time.time(),
                )
                return

            self._set_state(
                stage="loading-ground-truth",
                message="Loading ground-truth annotations and preparing branch-specific indices.",
            )
            self._ground_truth_indices = {
                "exon": self._build_ground_truth_index(
                    gene_biotypes=EXON_GENE_BIOTYPES,
                    transcript_types=EXON_TRANSCRIPT_TYPES,
                ),
                "cds": self._build_ground_truth_index(
                    gene_biotypes=CDS_GENE_BIOTYPES,
                    transcript_types=CDS_TRANSCRIPT_TYPES,
                ),
            }

            files, mapping = self._prediction_files_and_mapping()
            self._display_name_mapping = mapping
            self._set_state(
                stage="computing-models",
                message="Computing biologically rigorous gene-level metrics for bundled prediction files.",
                total_models=len(files),
                completed_models=0,
            )

            new_models: dict[str, ModelBundle] = {}
            for idx, pred_file in enumerate(files, start=1):
                display_name = self._display_name_for_path(pred_file)
                model_id = pred_file.stem
                self._set_state(
                    current_model=display_name,
                    message=f"Computing leaderboard metrics for {display_name} ({idx}/{len(files)}).",
                )
                new_models[model_id] = self._compute_model_bundle(
                    model_id=model_id,
                    display_name=display_name,
                    pred_gff=pred_file,
                    temporary=False,
                    source_file=pred_file.name,
                )
                self._set_state(completed_models=idx)

            with self._lock:
                self._permanent_models = new_models
            self._set_state(
                running=False,
                ready=True,
                missing_ground_truth=False,
                stage="ready",
                message="Leaderboard is ready.",
                current_model=None,
                finished_at=time.time(),
            )
        except Exception as exc:  # pragma: no cover - defensive
            self._set_state(
                running=False,
                ready=False,
                stage="error",
                error=str(exc),
                message="Leaderboard initialization failed.",
                current_model=None,
                finished_at=time.time(),
            )

    def _upload_worker(self) -> None:
        while True:
            job = self._upload_queue.get()
            try:
                with self._lock:
                    self._state.upload_current = str(job["model_name"])
                    self._state.upload_queue_length = self._upload_queue.qsize()
                if not self.ground_truth_path.exists():
                    continue
                pred_df = gff_text_to_dataframe(str(job["pred_gff_text"]))
                model_id = f"tmp-{_slugify(str(job['model_name']))}-{job['job_id'][:8]}"
                bundle = self._compute_model_bundle(
                    model_id=model_id,
                    display_name=str(job["model_name"]),
                    pred_gff=pred_df,
                    temporary=True,
                    source_file=None,
                )
                with self._lock:
                    self._temporary_models[model_id] = bundle
            except Exception:
                # Upload errors are intentionally not persisted to storage.
                pass
            finally:
                with self._lock:
                    self._state.upload_current = None
                    self._state.upload_queue_length = self._upload_queue.qsize()
                self._upload_queue.task_done()

    # ------------------------------------------------------------------
    # Model computation
    # ------------------------------------------------------------------

    def _compute_model_bundle(
        self,
        model_id: str,
        display_name: str,
        pred_gff: Path | pd.DataFrame,
        temporary: bool,
        source_file: str | None,
    ) -> ModelBundle:
        exon_result = self.evaluator.evaluate_gff_exon(
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            k_values=DEFAULT_K_VALUES,
            use_strand=USE_STRAND,
            gene_biotypes=EXON_GENE_BIOTYPES,
            transcript_types=EXON_TRANSCRIPT_TYPES,
        )
        cds_result = self.evaluator.evaluate_gff_cds(
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            k_values=DEFAULT_K_VALUES,
            use_strand=USE_STRAND,
            gene_biotypes=CDS_GENE_BIOTYPES,
            transcript_types=CDS_TRANSCRIPT_TYPES,
        )
        exon_result = self._compact_branch_result(exon_result)
        cds_result = self._compact_branch_result(cds_result)

        exon_stratifier = self.evaluator.build_stratifier(
            branch_result=exon_result,
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            use_strand=USE_STRAND,
            gene_biotypes=EXON_GENE_BIOTYPES,
            transcript_types=EXON_TRANSCRIPT_TYPES,
        )
        cds_stratifier = self.evaluator.build_stratifier(
            branch_result=cds_result,
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            use_strand=USE_STRAND,
            gene_biotypes=CDS_GENE_BIOTYPES,
            transcript_types=CDS_TRANSCRIPT_TYPES,
        )

        exon_detailed = self.evaluator.build_detailed_info(
            branch_result=exon_result,
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            use_strand=USE_STRAND,
            gene_biotypes=EXON_GENE_BIOTYPES,
            transcript_types=EXON_TRANSCRIPT_TYPES,
        )
        cds_detailed = self.evaluator.build_detailed_info(
            branch_result=cds_result,
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            use_strand=USE_STRAND,
            gene_biotypes=CDS_GENE_BIOTYPES,
            transcript_types=CDS_TRANSCRIPT_TYPES,
        )

        prediction_index = self._build_prediction_index(pred_gff)
        return ModelBundle(
            model_id=model_id,
            display_name=display_name,
            temporary=temporary,
            branch_results={"exon": exon_result, "cds": cds_result},
            stratifier={"exon": exon_stratifier, "cds": cds_stratifier},
            detailed={"exon": exon_detailed, "cds": cds_detailed},
            prediction_index=prediction_index,
            source_file=source_file,
        )

    def _compact_branch_result(self, result: dict[int, dict[str, object]]) -> dict[int, dict[str, object]]:
        compact = copy.deepcopy(result)
        max_k = max(compact.keys())
        for k, payload in compact.items():
            if int(k) == int(max_k):
                continue
            for level_name in ("interval-level", "segmentation-level"):
                payload.get(level_name, {}).pop("matched_pairs", None)
        return compact

    # ------------------------------------------------------------------
    # Ground truth and prediction indices
    # ------------------------------------------------------------------

    def _build_ground_truth_index(
        self,
        gene_biotypes: Iterable[str],
        transcript_types: Iterable[str],
    ) -> dict[str, object]:
        gt_df = self.evaluator._read_gff(self.ground_truth_path)
        normalized_gene_biotypes = self.evaluator._normalize_string_filter(gene_biotypes)
        normalized_transcript_types = self.evaluator._normalize_string_filter(transcript_types)
        true_rows = self.evaluator._extract_true_transcript_rows(
            gt_df,
            gene_biotypes=normalized_gene_biotypes,
            transcript_types=normalized_transcript_types,
        )
        true_tx = self.evaluator._true_rows_to_transcripts(true_rows, use_strand=USE_STRAND)
        true_parts = self.evaluator._extract_transcript_parts(
            gt_df,
            true_rows,
            id_col="transcript_id_final",
            use_strand=USE_STRAND,
        )

        type_map = {
            str(row.transcript_id_final): self._canonical_transcript_type(str(row.type_lower))
            for row in true_rows.itertuples(index=False)
        }
        genes: dict[str, dict[str, object]] = {}
        for row in true_tx.itertuples(index=False):
            gene_id = str(row.gene_id)
            tx_id = str(row.transcript_id)
            parts = true_parts.get(tx_id, {})
            transcript_record = {
                "transcript_id": tx_id,
                "transcript_type": type_map.get(tx_id, "Unknown"),
                "chromosome": str(row.seqid),
                "start": int(row.start),
                "end": int(row.end),
                "strand": str(row.strand),
                "length": int(row.end) - int(row.start) + 1,
                "exon_segments": parts.get("exon", []),
                "cds_segments": parts.get("cds", []),
            }
            gene_entry = genes.setdefault(
                gene_id,
                {
                    "gene_id": gene_id,
                    "chromosome": str(row.seqid),
                    "start": int(row.start),
                    "end": int(row.end),
                    "strand": str(row.strand),
                    "transcripts": [],
                },
            )
            gene_entry["start"] = min(gene_entry["start"], int(row.start))
            gene_entry["end"] = max(gene_entry["end"], int(row.end))
            gene_entry["transcripts"].append(transcript_record)

        gene_summaries: list[dict[str, object]] = []
        for gene_id, gene in genes.items():
            gene["transcripts"].sort(key=lambda item: (item["start"], item["transcript_id"]))
            summary = {
                "gene_id": gene_id,
                "chromosome": gene["chromosome"],
                "start": gene["start"],
                "end": gene["end"],
                "strand": gene["strand"],
                "transcript_count": len(gene["transcripts"]),
                "transcript_ids": [tx["transcript_id"] for tx in gene["transcripts"]],
                "transcript_types": sorted({tx["transcript_type"] for tx in gene["transcripts"]}),
            }
            gene_summaries.append(summary)

        gene_summaries.sort(key=lambda item: (item["chromosome"], item["start"], item["gene_id"]))
        return {"genes": genes, "gene_summaries": gene_summaries}

    def _build_prediction_index(self, pred_gff: Path | pd.DataFrame) -> dict[str, dict[str, object]]:
        common = self.evaluator._prepare_common_data(
            pred_gff=pred_gff,
            true_gff=self.ground_truth_path,
            k_values=[0],
            gene_biotypes=EXON_GENE_BIOTYPES,
            transcript_types=EXON_TRANSCRIPT_TYPES,
            use_strand=USE_STRAND,
        )
        index: dict[str, dict[str, object]] = {}
        for row in common["pred_tx"].itertuples(index=False):
            pred_id = str(row.pred_id)
            parts = common["pred_parts"].get(pred_id, {})
            index[pred_id] = {
                "chromosome": str(row.seqid),
                "start": int(row.start),
                "end": int(row.end),
                "strand": str(row.strand),
                "exon_segments": parts.get("exon", []),
                "cds_segments": parts.get("cds", []),
            }
        return index

    # ------------------------------------------------------------------
    # Serializers
    # ------------------------------------------------------------------

    def _serialize_model_overview(self, bundle: ModelBundle) -> dict[str, object]:
        curves = {branch: self._branch_curves(bundle.branch_results[branch]) for branch in BRANCHES}
        metrics_at_default_k = {
            branch: self._main_metrics_at_k(bundle.branch_results[branch], DEFAULT_K)
            for branch in BRANCHES
        }
        return {
            "model_id": bundle.model_id,
            "display_name": bundle.display_name,
            "temporary": bundle.temporary,
            "source_file": bundle.source_file,
            "metrics_at_default_k": metrics_at_default_k,
            "curves": curves,
        }

    def _serialize_full_metric_row(self, bundle: ModelBundle, branch: str, k: int) -> dict[str, object]:
        payload = bundle.branch_results[branch][int(k)]
        interval_payload = payload["interval-level"]
        segmentation_payload = payload["segmentation-level"]
        part_payload = payload["part-level"]
        return {
            "model_id": bundle.model_id,
            "display_name": bundle.display_name,
            "temporary": bundle.temporary,
            "interval_precision": interval_payload["precision"],
            "interval_recall": interval_payload["recall"],
            "interval_f1": interval_payload["f1"],
            "interval_mi": interval_payload["mi"],
            "segmentation_precision": segmentation_payload["precision"],
            "segmentation_recall": segmentation_payload["recall"],
            "segmentation_f1": segmentation_payload["f1"],
            "segmentation_mi": segmentation_payload["mi"],
            "part_precision": part_payload["precision"],
            "part_recall": part_payload["recall"],
            "part_f1": part_payload["f1"],
            "interval_counts": interval_payload["precision_counts"] | interval_payload["recall_counts"],
            "segmentation_counts": segmentation_payload["precision_counts"] | segmentation_payload["recall_counts"],
            "part_counts": part_payload["precision_counts"] | part_payload["recall_counts"],
        }

    def _branch_curves(self, branch_result: dict[int, dict[str, object]]) -> dict[str, list[float | int]]:
        curves = {metric_name: [] for metric_name in GRAPH_METRICS}
        for k in DEFAULT_K_VALUES:
            payload = branch_result[int(k)]
            for metric_name, (level_name, key_name) in GRAPH_METRICS.items():
                curves[metric_name].append(payload[level_name][key_name])
        return curves

    def _main_metrics_at_k(self, branch_result: dict[int, dict[str, object]], k: int) -> dict[str, float | int]:
        payload = branch_result[int(k)]
        return {
            "interval_f1": payload["interval-level"]["f1"],
            "interval_mi": payload["interval-level"]["mi"],
            "segmentation_f1": payload["segmentation-level"]["f1"],
            "segmentation_mi": payload["segmentation-level"]["mi"],
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _prediction_files_and_mapping(self) -> tuple[list[Path], dict[str, Any]]:
        remote_files, remote_mapping = self._download_remote_prediction_assets()
        if remote_files:
            return remote_files, remote_mapping
        return self._local_prediction_files(), self._local_mapping()

    def _local_prediction_files(self) -> list[Path]:
        if not self.predictions_dir.exists():
            return []
        return sorted(
            [
                path
                for path in self.predictions_dir.iterdir()
                if path.is_file() and path.suffix.lower() in {".gff", ".gff3", ".txt", ".gtf"}
            ],
            key=lambda path: path.name.lower(),
        )

    def _local_mapping(self) -> dict[str, Any]:
        if self.mapping_path.exists():
            return json.loads(self.mapping_path.read_text(encoding="utf-8"))
        return {}

    def _download_remote_prediction_assets(self) -> tuple[list[Path], dict[str, Any]]:
        try:
            mapping_url = f"{SOURCE_REPOSITORY_RAW_BASE}/model_name_mapping.json"
            with urlopen(mapping_url, timeout=30) as response:
                mapping = json.loads(response.read().decode("utf-8"))
            if not isinstance(mapping, dict):
                return [], {}

            predictions_out_dir = self.remote_cache_dir / "predictions"
            if predictions_out_dir.exists():
                shutil.rmtree(predictions_out_dir)
            predictions_out_dir.mkdir(parents=True, exist_ok=True)

            valid_suffixes = {".gff", ".gff3", ".txt", ".gtf"}
            files: list[Path] = []
            for filename in sorted(mapping.keys()):
                parsed = Path(filename)
                if parsed.suffix.lower() not in valid_suffixes:
                    continue
                destination = predictions_out_dir / filename
                destination.parent.mkdir(parents=True, exist_ok=True)
                stem = parsed.stem
                raw_candidates = [
                    f"{SOURCE_REPOSITORY_RAW_BASE}/predictions/{filename}",
                    f"{SOURCE_REPOSITORY_RAW_BASE}/{filename}",
                    f"{SOURCE_REPOSITORY_RAW_BASE}/predictions/{stem}.txt",
                    f"{SOURCE_REPOSITORY_RAW_BASE}/predictions/{stem}.gff",
                    f"{SOURCE_REPOSITORY_RAW_BASE}/predictions/{stem}.gff3",
                    f"{SOURCE_REPOSITORY_RAW_BASE}/predictions/{stem}.gtf",
                ]
                payload = None
                for raw_url in raw_candidates:
                    try:
                        with urlopen(raw_url, timeout=60) as response:
                            payload = response.read()
                        break
                    except URLError:
                        continue
                if payload is None:
                    continue
                destination.write_bytes(payload)
                files.append(destination)
            return files, mapping
        except Exception:
            return [], {}

    def _display_name_for_path(self, path: Path) -> str:
        mapping = self._display_name_mapping or self._local_mapping()
        if path.name in mapping:
            value = mapping[path.name]
            if isinstance(value, str):
                return value
            if isinstance(value, dict) and isinstance(value.get("display_name"), str):
                return value["display_name"]
        return path.stem.replace("_", " ")

    def _canonical_transcript_type(self, value: str) -> str:
        normalized = value.strip().lower()
        if normalized == "mrna":
            return "mRNA"
        if normalized in {"lnc_rna", "lncrna"}:
            return "lnc_RNA"
        return value

    def _get_bundle(self, model_id: str) -> ModelBundle:
        with self._lock:
            if model_id in self._permanent_models:
                return self._permanent_models[model_id]
            if model_id in self._temporary_models:
                return self._temporary_models[model_id]
        raise KeyError(f"Model '{model_id}' is not available.")

    def _selected_bundles(self, model_ids: Optional[list[str]]) -> list[ModelBundle]:
        with self._lock:
            if not model_ids:
                return self._ordered_bundles_locked()
            selected = []
            for model_id in model_ids:
                if model_id in self._permanent_models:
                    selected.append(self._permanent_models[model_id])
                elif model_id in self._temporary_models:
                    selected.append(self._temporary_models[model_id])
            return selected

    def _ordered_bundles_locked(self) -> list[ModelBundle]:
        bundles = list(self._permanent_models.values()) + list(self._temporary_models.values())
        bundles.sort(key=lambda item: (item.temporary, item.display_name.lower(), item.model_id))
        return bundles

    def _set_state(self, **kwargs: Any) -> None:
        with self._lock:
            for key, value in kwargs.items():
                setattr(self._state, key, value)
            self._state.upload_queue_length = self._upload_queue.qsize()
