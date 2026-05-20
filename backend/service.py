from __future__ import annotations

import copy
import json
import math
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from queue import Queue
from typing import Any, Iterable, Optional
from urllib.error import URLError
from urllib.request import urlopen

import pandas as pd

from gene_level_final_final_fix import GeneLevelEvaluator

from .gff_io import gff_text_to_dataframe, gff_text_to_dataframe_with_report


SOURCE_REPOSITORY_URL = "https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git"
DEFAULT_K_VALUES = list(range(0, 501))
DEFAULT_K = 250
USE_STRAND = True
EXON_TRANSCRIPT_TYPES = ["mRNA", "lnc_RNA"]
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
    branch_results_by_strand: dict[bool, dict[str, dict[int, dict[str, object]]]]
    stratifier_by_strand: dict[bool, dict[str, dict[str, dict[str, dict[int, dict[str, object]]]]]]
    detailed_by_strand: dict[bool, dict[str, dict[str, dict[str, object]]]]
    annotated_genes_by_strand: dict[bool, dict[int, dict[str, dict[str, dict[str, object]]]]]
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
    debug_log: list[str] = field(default_factory=list)

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
            "debug_log": list(self.debug_log),
        }


class LeaderboardService:
    def __init__(self, root_dir: Path) -> None:
        self.root_dir = root_dir
        self.data_dir = self.root_dir / "leaderboard_data"
        self.external_dir = self.root_dir / "external"
        self.pred_repo_dir = self.external_dir / "genatator-ab-initio-leaderboard-predictions"
        self.ground_truth_path = self.data_dir / "ground_truth" / "chr20.gff"
        self.sanitized_ground_truth_path = self.data_dir / "ground_truth" / "chr20.sanitized.gff"
        self._effective_ground_truth_path = self.ground_truth_path
        self.predictions_dir = self.data_dir / "predictions"
        self.mapping_path = self.data_dir / "model_name_mapping.json"
        self._display_name_mapping: dict[str, Any] = {}
        self._reference_mapping: dict[str, str] = {}

        self.evaluator = GeneLevelEvaluator()
        self._lock = threading.Lock()
        self._state = ServiceState()
        self._permanent_models: dict[str, ModelBundle] = {}
        self._temporary_models: dict[str, ModelBundle] = {}
        self._ground_truth_indices_by_strand: dict[bool, dict[str, dict[str, object]]] = {}
        self._ground_truth_input: Path | pd.DataFrame = self.ground_truth_path
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
                self._ground_truth_indices_by_strand = {}
                self._ground_truth_input = self.ground_truth_path
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

    def overview(self, use_strand: bool = True) -> dict[str, object]:
        with self._lock:
            status = self._state.to_dict()
            models = [
                self._serialize_model_overview(bundle, use_strand=use_strand)
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
            "default_use_strand": True,
        }

    def full_metrics(
        self,
        branch: str,
        k: int,
        model_ids: Optional[list[str]] = None,
        use_strand: bool = True,
    ) -> dict[str, object]:
        bundle_list = self._selected_bundles(model_ids)
        rows = [self._serialize_full_metric_row(bundle, branch, k, use_strand=use_strand) for bundle in bundle_list]
        return {"branch": branch, "k": int(k), "rows": rows}

    def stratifier(
        self,
        branch: str,
        k: int,
        model_id: str,
        rule: str,
        use_strand: bool = True,
    ) -> dict[str, object]:
        bundle = self._get_bundle(model_id)
        stratifier_tree = bundle.stratifier_by_strand[bool(use_strand)].get(branch, {})
        if rule not in stratifier_tree:
            raise KeyError(f"Stratification rule '{rule}' is not available for branch '{branch}'.")
        rows: list[dict[str, object]] = []
        for group_name, per_k in stratifier_tree[rule].items():
            metrics = per_k[int(k)]
            annotated_count = (
                bundle.annotated_genes_by_strand.get(bool(use_strand), {})
                .get(int(k), {})
                .get(rule, {})
                .get(group_name, {})
                .get("count", 0)
            )
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
                    "annotated_genes": annotated_count,
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
        use_strand: bool = True,
    ) -> dict[str, object]:
        index = self._ground_truth_indices_by_strand.get(use_strand, {}).get(branch)
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
        use_strand: bool = True,
    ) -> dict[str, object]:
        index = self._ground_truth_indices_by_strand.get(use_strand, {}).get(branch)
        if index is None or gene_id not in index["genes"]:
            raise KeyError(f"Ground-truth gene '{gene_id}' was not found for branch '{branch}'.")

        gene_data = copy.deepcopy(index["genes"][gene_id])
        selected_models = self._selected_bundles(model_ids)
        selected_k = int(k)

        for transcript in gene_data["transcripts"]:
            tx_id = transcript["transcript_id"]
            matches: list[dict[str, object]] = []
            for bundle in selected_models:
                detail_entry = bundle.detailed_by_strand[bool(use_strand)].get(branch, {}).get(tx_id)
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

    def compute_temporary_preview(self, model_name: str, pred_gff_text: str) -> dict[str, object]:
        display_name = model_name.strip() or "Temporary preview"
        model_id = f"preview-{_slugify(display_name)}"
        pred_df = gff_text_to_dataframe(str(pred_gff_text))
        if pred_df.empty:
            raise ValueError("Prediction file parsed to empty data.")
        pred_df = self._normalize_prediction_gff_for_evaluator(pred_df)
        bundle = self._compute_model_bundle(
            model_id=model_id,
            display_name=display_name,
            pred_gff=pred_df,
            temporary=True,
            source_file=None,
        )
        return self._serialize_temporary_preview(bundle)

    # ------------------------------------------------------------------
    # Initialization and uploads
    # ------------------------------------------------------------------

    def _initialize(self) -> None:
        try:
            self._set_state(
                stage="loading-predictions",
                message="Downloading permanent prediction files and model mapping.",
            )
            files, mapping, references = self._prediction_files_and_mapping()
            self._display_name_mapping = mapping
            self._reference_mapping = references

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
            shared_indices = {
                "exon": self._build_ground_truth_index(
                    transcript_types=EXON_TRANSCRIPT_TYPES,
                    use_strand=True,
                ),
                "cds": self._build_ground_truth_index(
                    transcript_types=CDS_TRANSCRIPT_TYPES,
                    use_strand=True,
                ),
            }
            self._ground_truth_indices_by_strand = {
                True: shared_indices,
                False: shared_indices,
            }

            self._set_state(
                stage="computing-models",
                message="Computing biologically rigorous gene-level metrics for bundled prediction files.",
                total_models=len(files),
                completed_models=0,
            )

            new_models: dict[str, ModelBundle] = {}
            failed_models: list[str] = []
            for idx, pred_file in enumerate(files, start=1):
                display_name = self._display_name_for_path(pred_file)
                model_id = pred_file.stem
                try:
                    pred_df = gff_text_to_dataframe(pred_file.read_text(encoding="utf-8"))
                    if pred_df.empty:
                        self._set_state(
                            message=f"Skipping {display_name}: prediction file parsed to empty data.",
                        )
                        continue
                    pred_df = self._normalize_prediction_gff_for_evaluator(pred_df)
                    self._set_state(
                        current_model=display_name,
                        completed_models=max(idx - 1, 0),
                        message=f"Computing leaderboard metrics for {display_name} ({idx}/{len(files)}).",
                    )
                    new_models[model_id] = self._compute_model_bundle(
                        model_id=model_id,
                        display_name=display_name,
                        pred_gff=pred_df,
                        temporary=False,
                        source_file=pred_file.name,
                    )
                except Exception as exc:
                    failed_models.append(f"{display_name}: {type(exc).__name__}: {exc}")
                    self._set_state(message=f"Skipping {display_name}: {type(exc).__name__}: {exc}")
                    continue

            with self._lock:
                self._permanent_models = new_models
            failed_details = ""
            if failed_models:
                preview = failed_models[:8]
                tail = "" if len(failed_models) <= 8 else f"\n... and {len(failed_models) - 8} more."
                failed_details = "Skipped model files:\n" + "\n".join(preview) + tail
            self._set_state(
                running=False,
                ready=True,
                missing_ground_truth=False,
                stage="ready",
                message=(
                    "Leaderboard is ready with 0 models. Prediction repository was reachable but no valid prediction files were loaded."
                    if not new_models
                    else ("Leaderboard is ready." if not failed_models else f"Leaderboard is ready. Skipped {len(failed_models)} model(s).")
                ),
                error=failed_details or None,
                debug_log=[],
                current_model=None,
                finished_at=time.time(),
            )
        except Exception as exc:  # pragma: no cover - defensive
            trace_tail = traceback.format_exc(limit=5)
            self._set_state(
                running=False,
                ready=False,
                stage="error",
                error=f"{type(exc).__name__}: {exc}\n{trace_tail}",
                message=f"Leaderboard initialization failed: {type(exc).__name__}: {exc}",
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
                pred_df = self._normalize_prediction_gff_for_evaluator(pred_df)
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
        branch_results_by_strand = {}
        stratifier_by_strand = {}
        detailed_by_strand = {}
        annotated_genes_by_strand = {}
        for use_strand in (True, False):
            raw_exon_result = self.evaluator.evaluate_gff_exon(
                pred_gff=pred_gff,
                true_gff=self._ground_truth_input,
                k_values=DEFAULT_K_VALUES,
                use_strand=use_strand,
                transcript_types=EXON_TRANSCRIPT_TYPES,
            )
            raw_cds_result = self.evaluator.evaluate_gff_cds(
                pred_gff=pred_gff,
                true_gff=self._ground_truth_input,
                k_values=DEFAULT_K_VALUES,
                use_strand=use_strand,
                transcript_types=CDS_TRANSCRIPT_TYPES,
            )
            exon_stratifier = self.evaluator.build_stratifier(
                branch_result=raw_exon_result,
                pred_gff=pred_gff,
                true_gff=self._ground_truth_input,
                use_strand=use_strand,
                transcript_types=EXON_TRANSCRIPT_TYPES,
            )
            cds_stratifier = self.evaluator.build_stratifier(
                branch_result=raw_cds_result,
                pred_gff=pred_gff,
                true_gff=self._ground_truth_input,
                use_strand=use_strand,
                transcript_types=CDS_TRANSCRIPT_TYPES,
            )
            exon_detailed = self.evaluator.build_detailed_info(
                branch_result=raw_exon_result,
                pred_gff=pred_gff,
                true_gff=self._ground_truth_input,
                use_strand=use_strand,
                transcript_types=EXON_TRANSCRIPT_TYPES,
            )
            cds_detailed = self.evaluator.build_detailed_info(
                branch_result=raw_cds_result,
                pred_gff=pred_gff,
                true_gff=self._ground_truth_input,
                use_strand=use_strand,
                transcript_types=CDS_TRANSCRIPT_TYPES,
            )
            exon_detailed = self.evaluator.build_annotated_transcripts_detailed(
                exon_detailed=exon_detailed,
                cds_detailed=cds_detailed,
                transcript_types=tuple(EXON_TRANSCRIPT_TYPES),
                mrna_type="mRNA",
            )
            annotated_genes = self.evaluator.build_annotated_genes(
                exon_result=raw_exon_result,
                cds_result=raw_cds_result,
                transcript_types=tuple(EXON_TRANSCRIPT_TYPES),
                mrna_type="mRNA",
                include_gene_ids=True,
            )
            exon_result = self._compact_branch_result(raw_exon_result)
            cds_result = self._compact_branch_result(raw_cds_result)
            for k in DEFAULT_K_VALUES:
                genes_union: set[str] = set()
                for group in annotated_genes.get("chromosome", {}).values():
                    genes_union.update(group.get(int(k), {}).get("gene_ids", []))
                annotated_genes.setdefault("all", {}).setdefault("all", {})[int(k)] = {
                    "count": len(genes_union),
                    "gene_ids": sorted(genes_union),
                }
            branch_results_by_strand[use_strand] = {"exon": exon_result, "cds": cds_result}
            stratifier_by_strand[use_strand] = {"exon": exon_stratifier, "cds": cds_stratifier}
            detailed_by_strand[use_strand] = {"exon": exon_detailed, "cds": cds_detailed}
            annotated_genes_by_strand[use_strand] = annotated_genes

        prediction_index = self._build_prediction_index(pred_gff)
        return ModelBundle(
            model_id=model_id,
            display_name=display_name,
            temporary=temporary,
            branch_results_by_strand=branch_results_by_strand,
            stratifier_by_strand=stratifier_by_strand,
            detailed_by_strand=detailed_by_strand,
            annotated_genes_by_strand=annotated_genes_by_strand,
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

    def _normalize_prediction_gff_for_evaluator(self, pred_df: pd.DataFrame) -> pd.DataFrame:
        if pred_df.empty:
            return pred_df
        df = pred_df.copy().reset_index(drop=True)
        parsed = self.evaluator._read_gff(df)
        allowed_types = {"mrna", "lnc_rna"}

        def parent_candidates(row: object) -> list[str]:
            values: list[str] = []
            for attr_name in ("Parent", "transcript_id"):
                value = getattr(row, attr_name, None)
                if value is None or self.evaluator._is_missing_value(value):
                    continue
                for part in str(value).split(","):
                    part = part.strip()
                    if part:
                        values.append(part)
            seen = set()
            output: list[str] = []
            for value in values:
                if value not in seen:
                    seen.add(value)
                    output.append(value)
            return output

        cds_parent_ids: set[str] = set()
        part_rows = parsed[parsed["type_lower"].isin(self.evaluator.PART_TYPES)].copy()
        for row in part_rows.itertuples(index=False):
            if str(row.type_lower) == "cds":
                cds_parent_ids.update(parent_candidates(row))

        transcript_mask = parsed["type_lower"].isin(self.evaluator.TRANSCRIPT_TYPES)
        existing_tx_ids: set[str] = set()
        for idx, row in parsed.loc[transcript_mask].iterrows():
            tx_id = row.get("ID") or row.get("transcript_id") or f"pred_tx_{idx}"
            tx_id = str(tx_id)
            existing_tx_ids.add(tx_id)
            canonical = self.evaluator._canonical_transcript_type(row.get("type_lower", ""))
            if canonical not in allowed_types:
                df.at[idx, "type"] = "mRNA" if tx_id in cds_parent_ids else "lnc_RNA"

        normalized_types = self.evaluator._normalize_transcript_type_filter(EXON_TRANSCRIPT_TYPES)
        try:
            parsed_after = self.evaluator._read_gff(df)
            self.evaluator._extract_pred_transcript_rows(parsed_after, transcript_types=normalized_types)
            return df
        except ValueError:
            pass

        grouped_parts: dict[str, list[object]] = {}
        for row in part_rows.itertuples(index=False):
            for parent_id in parent_candidates(row):
                grouped_parts.setdefault(parent_id, []).append(row)

        synthetic_rows: list[dict[str, object]] = []
        for tx_id, rows in grouped_parts.items():
            if tx_id in existing_tx_ids or not rows:
                continue
            starts = [int(row.start) for row in rows]
            ends = [int(row.end) for row in rows]
            first = rows[0]
            has_cds = any(str(row.type_lower) == "cds" for row in rows)
            tx_type = "mRNA" if has_cds else "lnc_RNA"
            synthetic_rows.append(
                {
                    "seqid": str(first.seqid),
                    "source": "service_normalized",
                    "type": tx_type,
                    "start": min(starts),
                    "end": max(ends),
                    "score": ".",
                    "strand": str(first.strand),
                    "phase": ".",
                    "attributes": f"ID={tx_id};transcript_id={tx_id}",
                }
            )
        if synthetic_rows:
            df = pd.concat([pd.DataFrame(synthetic_rows), df], ignore_index=True)

        parsed_final = self.evaluator._read_gff(df)
        self.evaluator._extract_pred_transcript_rows(parsed_final, transcript_types=normalized_types)
        return df

    # ------------------------------------------------------------------
    # Ground truth and prediction indices
    # ------------------------------------------------------------------

    def _build_ground_truth_index(
        self,
        transcript_types: Iterable[str],
        use_strand: bool,
    ) -> dict[str, object]:
        gt_df = self.evaluator._read_gff(self._ground_truth_input)
        normalized_transcript_types = self.evaluator._normalize_transcript_type_filter(transcript_types)
        true_rows = self.evaluator._extract_true_transcript_rows(
            gt_df,
            transcript_types=normalized_transcript_types,
        )
        true_tx = self.evaluator._true_rows_to_transcripts(true_rows, use_strand=use_strand)
        true_parts = self.evaluator._extract_transcript_parts(
            gt_df,
            true_rows,
            id_col="transcript_id_final",
            use_strand=use_strand,
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
            true_gff=self._ground_truth_input,
            k_values=[0],
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

    def _serialize_model_overview(self, bundle: ModelBundle, use_strand: bool = True) -> dict[str, object]:
        branch_results = bundle.branch_results_by_strand[bool(use_strand)]
        curves = {branch: self._branch_curves(branch_results[branch]) for branch in BRANCHES}
        metrics_at_default_k = {
            branch: self._main_metrics_at_k(branch_results[branch], DEFAULT_K)
            for branch in BRANCHES
        }
        return {
            "model_id": bundle.model_id,
            "display_name": bundle.display_name,
            "reference_url": self._reference_url_for_bundle(bundle),
            "temporary": bundle.temporary,
            "source_file": bundle.source_file,
            "metrics_at_default_k": metrics_at_default_k,
            "annotated_genes": bundle.annotated_genes_by_strand[bool(use_strand)],
            "curves": curves,
        }

    def _serialize_full_metric_row(self, bundle: ModelBundle, branch: str, k: int, use_strand: bool = True) -> dict[str, object]:
        payload = bundle.branch_results_by_strand[bool(use_strand)][branch][int(k)]
        interval_payload = payload["interval-level"]
        segmentation_payload = payload["segmentation-level"]
        part_payload = payload["part-level"]
        return {
            "model_id": bundle.model_id,
            "display_name": bundle.display_name,
            "reference_url": self._reference_url_for_bundle(bundle),
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
            "annotated_genes": bundle.annotated_genes_by_strand[bool(use_strand)].get("all", {}).get("all", {}).get(int(k), {}).get("count", 0),
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

    def _serialize_temporary_preview(self, bundle: ModelBundle) -> dict[str, object]:
        full_by_branch: dict[str, dict[int, dict[str, object]]] = {}
        full_by_strand: dict[str, dict[str, dict[int, dict[str, object]]]] = {}
        for use_strand in (True, False):
            strand_key = "true" if use_strand else "false"
            full_by_strand[strand_key] = {}
            for branch in BRANCHES:
                per_k: dict[int, dict[str, object]] = {}
                for k in DEFAULT_K_VALUES:
                    per_k[int(k)] = self._serialize_full_metric_row(bundle, branch=branch, k=int(k), use_strand=use_strand)
                full_by_strand[strand_key][branch] = per_k
                if use_strand:
                    full_by_branch[branch] = per_k
        return {
            "model": self._serialize_model_overview(bundle, use_strand=True),
            "full_metrics": full_by_branch,
            "full_metrics_by_strand": full_by_strand,
            "stratifier_by_strand": bundle.stratifier_by_strand,
            "detailed_by_strand": bundle.detailed_by_strand,
            "stratifier": bundle.stratifier_by_strand[True],
            "detailed": bundle.detailed_by_strand[True],
            "prediction_index": bundle.prediction_index,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _prediction_files_and_mapping(self) -> tuple[list[Path], dict[str, Any], dict[str, str]]:
        remote_files, remote_mapping, remote_references = self._sync_predictions_repo()
        if remote_files:
            self._set_state(message=f"Loaded {len(remote_files)} prediction file(s) from remote repository.")
            return remote_files, remote_mapping, remote_references
        self._set_state(message="Remote prediction sync yielded 0 files. Falling back to local leaderboard_data/predictions.")
        return self._local_prediction_files(), self._local_mapping(), {}

    def _local_prediction_files(self) -> list[Path]:
        if not self.predictions_dir.exists():
            return []
        return sorted(
            [
                path
                for path in self.predictions_dir.rglob("*")
                if path.is_file() and path.suffix.lower() in {".gff", ".gff3", ".txt", ".gtf"}
            ],
            key=lambda path: str(path).lower(),
        )

    def _local_mapping(self) -> dict[str, Any]:
        if self.mapping_path.exists():
            return json.loads(self.mapping_path.read_text(encoding="utf-8"))
        return {}

    def _sync_predictions_repo(self) -> tuple[list[Path], dict[str, Any], dict[str, str]]:
        try:
            self.external_dir.mkdir(parents=True, exist_ok=True)
            if self.pred_repo_dir.exists():
                pull = subprocess.run(
                    ["git", "-C", str(self.pred_repo_dir), "pull", "--ff-only"],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                if pull.returncode != 0:
                    self._set_state(message=f"Remote git pull failed ({pull.returncode}). Re-cloning prediction repository.")
                    shutil.rmtree(self.pred_repo_dir, ignore_errors=True)
                    clone = subprocess.run(
                        ["git", "clone", SOURCE_REPOSITORY_URL, str(self.pred_repo_dir)],
                        check=False,
                        capture_output=True,
                        text=True,
                    )
                    if clone.returncode != 0:
                        raise RuntimeError(f"git clone failed: {clone.stderr.strip() or clone.stdout.strip()}")
            else:
                clone = subprocess.run(
                    ["git", "clone", SOURCE_REPOSITORY_URL, str(self.pred_repo_dir)],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                if clone.returncode != 0:
                    raise RuntimeError(f"git clone failed: {clone.stderr.strip() or clone.stdout.strip()}")

            predictions_src_dir = self.pred_repo_dir / "predictions"
            if not predictions_src_dir.exists():
                predictions_src_dir = self.pred_repo_dir

            mapping: dict[str, Any] = {}
            for mapping_name in ("model_name_mapping.json", "name_mapping.json"):
                mapping_path = self.pred_repo_dir / mapping_name
                if mapping_path.exists():
                    loaded = self._load_json_like_dict(mapping_path)
                    if loaded is not None:
                        mapping = loaded
                        break

            references: dict[str, str] = {}
            references_path = self.pred_repo_dir / "references.json"
            if references_path.exists():
                loaded_references = self._load_json_like_dict(references_path)
                if loaded_references is not None:
                    for key, value in loaded_references.items():
                        if isinstance(value, str) and value.strip():
                            references[Path(str(key)).stem] = value.strip()

            valid_suffixes = {".gff", ".gff3", ".txt", ".gtf"}
            files = sorted(
                [path for path in predictions_src_dir.rglob("*") if path.is_file() and path.suffix.lower() in valid_suffixes],
                key=lambda path: str(path).lower(),
            )
            normalized_map: dict[str, Any] = {}
            for key, value in mapping.items():
                normalized_map[Path(str(key)).stem] = value
            return files, normalized_map, references
        except Exception as exc:
            self._set_state(message=f"Git sync failed: {type(exc).__name__}: {exc}. Trying ZIP fallback.")
            try:
                zip_url = "https://codeload.github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions/zip/refs/heads/main"
                zip_path = self.external_dir / "predictions_repo.zip"
                with urlopen(zip_url, timeout=60) as response:
                    zip_path.write_bytes(response.read())
                extract_root = self.external_dir / "predictions_repo_zip"
                if extract_root.exists():
                    shutil.rmtree(extract_root, ignore_errors=True)
                extract_root.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(extract_root)
                dirs = [p for p in extract_root.iterdir() if p.is_dir()]
                if not dirs:
                    return [], {}, {}
                repo_dir = dirs[0]
                predictions_src_dir = repo_dir / "predictions"
                if not predictions_src_dir.exists():
                    predictions_src_dir = repo_dir
                valid_suffixes = {".gff", ".gff3", ".txt", ".gtf"}
                files = sorted(
                    [path for path in predictions_src_dir.rglob("*") if path.is_file() and path.suffix.lower() in valid_suffixes],
                    key=lambda path: str(path).lower(),
                )
                mapping: dict[str, Any] = {}
                for mapping_name in ("model_name_mapping.json", "name_mapping.json"):
                    mapping_path = repo_dir / mapping_name
                    if mapping_path.exists():
                        loaded = self._load_json_like_dict(mapping_path)
                        if loaded is not None:
                            mapping = loaded
                            break
                references: dict[str, str] = {}
                references_path = repo_dir / "references.json"
                if references_path.exists():
                    loaded_references = self._load_json_like_dict(references_path)
                    if loaded_references is not None:
                        for key, value in loaded_references.items():
                            if isinstance(value, str) and value.strip():
                                references[Path(str(key)).stem] = value.strip()
                normalized_map = {Path(str(key)).stem: value for key, value in mapping.items()}
                self._set_state(message=f"ZIP fallback loaded {len(files)} prediction file(s).")
                return files, normalized_map, references
            except Exception as fallback_exc:
                self._set_state(error=f"Prediction sync failed: {type(fallback_exc).__name__}: {fallback_exc}")
                return [], {}, {}

    def _display_name_for_path(self, path: Path) -> str:
        mapping = self._display_name_mapping or self._local_mapping()
        if path.stem in mapping:
            value = mapping[path.stem]
            if isinstance(value, str):
                return value
            if isinstance(value, dict) and isinstance(value.get("display_name"), str):
                return value["display_name"]
        if path.name in mapping:
            value = mapping[path.name]
            if isinstance(value, str):
                return value
            if isinstance(value, dict) and isinstance(value.get("display_name"), str):
                return value["display_name"]
        return path.name

    def _load_json_like_dict(self, path: Path) -> dict[str, Any] | None:
        try:
            text = path.read_text(encoding="utf-8")
            try:
                loaded = json.loads(text)
                return loaded if isinstance(loaded, dict) else None
            except json.JSONDecodeError:
                sanitized = re.sub(r"//.*?$|/\*.*?\*/", "", text, flags=re.MULTILINE | re.DOTALL)
                sanitized = re.sub(r",\s*([}\]])", r"\1", sanitized)
                loaded = json.loads(sanitized)
                return loaded if isinstance(loaded, dict) else None
        except Exception:
            return None

    def _reference_url_for_bundle(self, bundle: ModelBundle) -> str | None:
        if bundle.temporary:
            return None
        candidates = [bundle.model_id, bundle.display_name]
        if bundle.source_file:
            candidates.extend([Path(bundle.source_file).stem, Path(bundle.source_file).name])
        for key in candidates:
            if key in self._reference_mapping:
                return self._reference_mapping[key]
        return None

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
            message = kwargs.get("message")
            error = kwargs.get("error")
            if isinstance(message, str) and message.strip():
                self._state.debug_log.append(f"[{time.strftime('%H:%M:%S')}] {message.strip()}")
            if isinstance(error, str) and error.strip():
                self._state.debug_log.append(f"[{time.strftime('%H:%M:%S')}] ERROR: {error.strip()}")
            self._state.debug_log = self._state.debug_log[-200:]
            self._state.upload_queue_length = self._upload_queue.qsize()
