
#!/usr/bin/env python
# -*- coding: utf-8 -*-


from copy import deepcopy
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple, Union

import numpy as np
import pandas as pd


PathLike = Union[str, Path]


class GeneLevelEvaluator:
    """
    Gene-level evaluator for two ordinary GFF/GFF3 files.

    Public API:
    - evaluate_gff_exon(...)
    - evaluate_gff_cds(...)

    Shared logic in both branches:
    1) interval-level matching with tolerance k
    2) segmentation filtering of the already found interval pairs
    3) exact part-level metrics for unique exons / CDS
    """

    GFF_COLUMNS = [
        "seqid",
        "source",
        "type",
        "start",
        "end",
        "score",
        "strand",
        "phase",
        "attributes",
    ]

    TRANSCRIPT_TYPES = {
        "transcript",
        "mrna",
        "rna",
        "lnc_rna",
        "lncrna",
        "ncrna",
        "rrna",
        "trna",
        "snrna",
        "snorna",
        "scrna",
        "srprna",
        "tmrna",
        "primary_transcript",
        "pseudogenic_transcript",
        "pre_mirna",
        "mirna",
    }

    GENE_TYPES = {"gene",}
    PART_TYPES = {"exon", "cds"}
    PAIR_COLUMNS = ["pred_id", "pred_obj_key", "true_tx_id", "gene_id", "true_obj_key", "k_needed"]


    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def evaluate_gff_exon(
        self,
        pred_gff: Union[PathLike, pd.DataFrame],
        true_gff: Union[PathLike, pd.DataFrame],
        k_values: Iterable[int],
        use_strand: bool = False,
        gene_biotypes: Optional[Union[str, Iterable[str]]] = None,
        transcript_types: Optional[Union[str, Iterable[str]]] = None,
    ) -> Dict[int, Dict[str, object]]:
        common = self._prepare_common_data(
            pred_gff=pred_gff,
            true_gff=true_gff,
            k_values=k_values,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
            use_strand=use_strand,
        )
        branch_data = self._prepare_branch_data(common=common, use_strand=use_strand, branch="exon")
        return self._evaluate_branch(branch_data=branch_data, k_values=common["k_values"])
    
    def evaluate_gff_cds(
        self,
        pred_gff: Union[PathLike, pd.DataFrame],
        true_gff: Union[PathLike, pd.DataFrame],
        k_values: Iterable[int],
        use_strand: bool = False,
        gene_biotypes: Optional[Union[str, Iterable[str]]] = None,
        transcript_types: Optional[Union[str, Iterable[str]]] = None,
    ) -> Dict[int, Dict[str, object]]:
        common = self._prepare_common_data(
            pred_gff=pred_gff,
            true_gff=true_gff,
            k_values=k_values,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
            use_strand=use_strand,
        )
        branch_data = self._prepare_branch_data(common=common, use_strand=use_strand, branch="cds")
        return self._evaluate_branch(branch_data=branch_data, k_values=common["k_values"])

    # ------------------------------------------------------------------
    # Branch preparation and explicit k loop
    # ------------------------------------------------------------------

    def _prepare_branch_data(
        self,
        common: Dict[str, object],
        use_strand: bool,
        branch: str,
    ) -> Dict[str, object]:
        if branch == "exon":
            true_analysis_tx = common["true_tx"].copy()
            pred_analysis_tx = common["pred_tx"].copy()

            interval_true_tx = true_analysis_tx.copy()
            interval_true_tx["object_key"] = interval_true_tx["transcript_key"]
            interval_pred_tx = pred_analysis_tx.copy()

            true_seg_tx = self._filter_transcripts_with_part(
                transcripts_df=true_analysis_tx,
                parts_info=common["true_parts"],
                id_col="transcript_id",
                part_name="exon",
            )
            pred_seg_tx = self._filter_transcripts_with_part(
                transcripts_df=pred_analysis_tx,
                parts_info=common["pred_parts"],
                id_col="pred_id",
                part_name="exon",
            )

            part_name = "exon"
            segmentation_mode = "exon"
            interval_mode = "symmetric"
            all_pred_ids = common["all_pred_ids"]
            all_true_genes = common["all_true_genes"]
            segmentation_all_true_genes = (
                sorted(true_seg_tx["gene_id"].dropna().astype(str).unique().tolist())
                if not true_seg_tx.empty
                else []
            )
            part_level_true_tx = true_analysis_tx
            part_level_pred_tx = pred_analysis_tx

        elif branch == "cds":
            true_analysis_tx = self._filter_transcripts_with_part(
                transcripts_df=common["true_tx"],
                parts_info=common["true_parts"],
                id_col="transcript_id",
                part_name="cds",
            )
            pred_analysis_tx = self._filter_transcripts_with_part(
                transcripts_df=common["pred_tx"],
                parts_info=common["pred_parts"],
                id_col="pred_id",
                part_name="cds",
            )

            interval_true_tx = self._build_outer_part_interval_transcripts(
                transcripts_df=true_analysis_tx,
                parts_info=common["true_parts"],
                id_col="transcript_id",
                part_name="cds",
                keep_gene_id=True,
                use_strand=use_strand,
            )
            interval_pred_tx = self._build_outer_part_interval_transcripts(
                transcripts_df=pred_analysis_tx,
                parts_info=common["pred_parts"],
                id_col="pred_id",
                part_name="cds",
                keep_gene_id=False,
                use_strand=use_strand,
            )
            if not interval_true_tx.empty:
                interval_true_tx["object_key"] = interval_true_tx["transcript_key"]

            true_seg_tx = true_analysis_tx
            pred_seg_tx = pred_analysis_tx

            part_name = "cds"
            segmentation_mode = "exact"
            interval_mode = "cds_core"
            all_pred_ids = (
                interval_pred_tx["pred_id"].dropna().astype(str).tolist()
                if not interval_pred_tx.empty
                else []
            )
            all_true_genes = (
                sorted(interval_true_tx["gene_id"].dropna().astype(str).unique().tolist())
                if not interval_true_tx.empty
                else []
            )
            segmentation_all_true_genes = (
                sorted(true_seg_tx["gene_id"].dropna().astype(str).unique().tolist())
                if not true_seg_tx.empty
                else []
            )
            part_level_true_tx = true_analysis_tx
            part_level_pred_tx = pred_analysis_tx
        else:
            raise ValueError(f"Unsupported branch: {branch!r}")

        true_seg_keys = self._build_segmentation_keys(
            tx_df=true_seg_tx,
            parts_info=common["true_parts"],
            id_col="transcript_id",
            part_name=part_name,
            mode=segmentation_mode,
            use_strand=use_strand,
        )
        pred_seg_keys = self._build_segmentation_keys(
            tx_df=pred_seg_tx,
            parts_info=common["pred_parts"],
            id_col="pred_id",
            part_name=part_name,
            mode=segmentation_mode,
            use_strand=use_strand,
        )

        interval_allowed_genes = self._find_allowed_genes(interval_true_tx, key_col="object_key")
        segmentation_allowed_genes = self._find_allowed_genes_from_key_map(
            true_tx=true_seg_tx,
            key_map=true_seg_keys,
        )

        true_part_df = self._build_part_level_table(
            transcripts_df=part_level_true_tx,
            parts_info=common["true_parts"],
            id_col="transcript_id",
            part_name=part_name,
        )
        pred_part_df = self._build_part_level_table(
            transcripts_df=part_level_pred_tx,
            parts_info=common["pred_parts"],
            id_col="pred_id",
            part_name=part_name,
        )
        part_level_result = self._build_exact_part_level_result(
            pred_parts_df=pred_part_df,
            true_parts_df=true_part_df,
            use_strand=use_strand,
            part_name=part_name,
        )

        return {
            "branch": branch,
            "use_strand": use_strand,
            "segmentation_part_name": part_name,
            "segmentation_match_mode": segmentation_mode,
            "interval_mode": interval_mode,
            "true_parts": common["true_parts"],
            "pred_parts": common["pred_parts"],
            "true_analysis_tx": true_analysis_tx,
            "pred_analysis_tx": pred_analysis_tx,
            "true_seg_tx": true_seg_tx,
            "pred_seg_tx": pred_seg_tx,
            "part_level_true_tx": part_level_true_tx,
            "part_level_pred_tx": part_level_pred_tx,
            "interval_true_tx": interval_true_tx,
            "interval_pred_tx": interval_pred_tx,
            "all_pred_ids": all_pred_ids,
            "all_true_genes": all_true_genes,
            "segmentation_all_true_genes": segmentation_all_true_genes,
            "interval_allowed_genes": interval_allowed_genes,
            "segmentation_allowed_genes": segmentation_allowed_genes,
            "true_segmentation_keys": true_seg_keys,
            "pred_segmentation_keys": pred_seg_keys,
            "part_level_result": part_level_result,
        }

    def _evaluate_branch(
        self,
        branch_data: Dict[str, object],
        k_values: List[int],
    ) -> Dict[int, Dict[str, object]]:
        results: Dict[int, Dict[str, object]] = {}

        for k in k_values:
            interval_pairs = self._collect_interval_pairs(
                pred_tx=branch_data["interval_pred_tx"],
                true_tx=branch_data["interval_true_tx"],
                max_k=int(k),
                use_strand=bool(branch_data["use_strand"]),
                mode=str(branch_data["interval_mode"]),
            )
            interval_result = self._calculate_pair_metrics_for_k(
                pairs=interval_pairs,
                all_pred_ids=branch_data["all_pred_ids"],
                all_true_genes=branch_data["all_true_genes"],
                allowed_genes=branch_data["interval_allowed_genes"],
            )
            interval_result["matched_pairs"] = self._pairs_to_records(interval_pairs)

            segmentation_pairs = self._collect_segmentation_pairs(
                base_pairs=interval_pairs,
                pred_parts=branch_data["pred_parts"],
                true_parts=branch_data["true_parts"],
                part_name=str(branch_data["segmentation_part_name"]),
                match_mode=str(branch_data["segmentation_match_mode"]),
                use_strand=bool(branch_data["use_strand"]),
                true_segmentation_keys=branch_data["true_segmentation_keys"],
                pred_segmentation_keys=branch_data["pred_segmentation_keys"],
            )
            segmentation_result = self._calculate_pair_metrics_for_k(
                pairs=segmentation_pairs,
                all_pred_ids=branch_data["all_pred_ids"],
                all_true_genes=branch_data["segmentation_all_true_genes"],
                allowed_genes=branch_data["segmentation_allowed_genes"],
            )
            segmentation_result["matched_pairs"] = self._pairs_to_records(segmentation_pairs)

            results[int(k)] = {
                "interval-level": interval_result,
                "segmentation-level": segmentation_result,
                "part-level": deepcopy(branch_data["part_level_result"]),
            }

        return results

    def _prepare_common_data(
        self,
        pred_gff: Union[PathLike, pd.DataFrame],
        true_gff: Union[PathLike, pd.DataFrame],
        k_values: Iterable[int],
        gene_biotypes: Optional[Union[str, Iterable[str]]] = None,
        transcript_types: Optional[Union[str, Iterable[str]]] = None,
        use_strand: bool = False,
    ) -> Dict[str, object]:
        k_values = self._normalize_k_values(k_values)
        gene_biotypes = self._normalize_string_filter(gene_biotypes)
        transcript_types = self._normalize_string_filter(transcript_types)

        true_df = self._read_gff(true_gff)
        pred_df = self._read_gff(pred_gff)

        true_tx_rows = self._extract_true_transcript_rows(
            df=true_df,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
        )
        pred_tx_rows = self._extract_pred_transcript_rows(pred_df)

        true_tx = self._true_rows_to_transcripts(true_tx_rows, use_strand=use_strand)
        pred_tx = self._pred_rows_to_transcripts(pred_tx_rows, use_strand=use_strand)

        if true_tx.empty:
            raise ValueError("No true transcripts were found in the ground-truth GFF.")
        if pred_tx.empty:
            raise ValueError("No predicted transcripts were found in the prediction GFF.")

        true_parts = self._extract_transcript_parts(
            df=true_df,
            transcript_rows=true_tx_rows,
            id_col="transcript_id_final",
            use_strand=use_strand,
        )
        pred_parts = self._extract_transcript_parts(
            df=pred_df,
            transcript_rows=pred_tx_rows,
            id_col="pred_id",
            use_strand=use_strand,
        )

        return {
            "k_values": k_values,
            "max_k": max(k_values),
            "true_df": true_df,
            "pred_df": pred_df,
            "true_tx_rows": true_tx_rows,
            "pred_tx_rows": pred_tx_rows,
            "true_tx": true_tx,
            "pred_tx": pred_tx,
            "true_parts": true_parts,
            "pred_parts": pred_parts,
            "all_true_genes": sorted(true_tx["gene_id"].dropna().astype(str).unique().tolist()),
            "all_pred_ids": pred_tx["pred_id"].dropna().astype(str).tolist(),
        }

    # ------------------------------------------------------------------
    # Interval matching
    # ------------------------------------------------------------------

    def _collect_interval_pairs(
        self,
        pred_tx: pd.DataFrame,
        true_tx: pd.DataFrame,
        max_k: int,
        use_strand: bool,
        mode: str,
    ) -> pd.DataFrame:
        if pred_tx.empty or true_tx.empty:
            return self._empty_pair_df()

        group_cols = self._group_columns(use_strand)
        pairs: List[Tuple[str, Tuple[object, ...], str, str, Tuple[object, ...], int]] = []

        true_groups = {
            key: group.sort_values("start").reset_index(drop=True)
            for key, group in true_tx.groupby(group_cols, sort=False)
        }

        for key, pred_group in pred_tx.groupby(group_cols, sort=False):
            true_group = true_groups.get(key)
            if true_group is None or true_group.empty:
                continue

            true_starts = true_group["start"].to_numpy(dtype=int)
            true_ends = true_group["end"].to_numpy(dtype=int)
            true_ids = true_group["transcript_id"].to_numpy(dtype=object)
            gene_ids = true_group["gene_id"].to_numpy(dtype=object)
            true_keys = true_group["object_key"].to_numpy(dtype=object)

            for row in pred_group.itertuples(index=False):
                pred_start = int(row.start)
                pred_end = int(row.end)

                if mode == "symmetric":
                    left = np.searchsorted(true_starts, pred_start - max_k, side="left")
                    right = np.searchsorted(true_starts, pred_start + max_k, side="right")
                    if left == right:
                        continue

                    cand_slice = slice(left, right)
                    end_diff = np.abs(true_ends[cand_slice] - pred_end)
                    ok = end_diff <= max_k
                    if not np.any(ok):
                        continue

                    local_idx = np.where(ok)[0]
                    global_idx = local_idx + left
                    k_needed = np.maximum(
                        np.abs(true_starts[global_idx] - pred_start),
                        np.abs(true_ends[global_idx] - pred_end),
                    )

                elif mode == "cds_core":
                    left = np.searchsorted(true_starts, pred_start, side="left")
                    right = np.searchsorted(true_starts, pred_start + max_k, side="right")
                    if left == right:
                        continue

                    cand_slice = slice(left, right)
                    start_overhang = true_starts[cand_slice] - pred_start
                    end_overhang = pred_end - true_ends[cand_slice]
                    ok = (start_overhang >= 0) & (end_overhang >= 0) & (end_overhang <= max_k)
                    if not np.any(ok):
                        continue

                    local_idx = np.where(ok)[0]
                    global_idx = local_idx + left
                    k_needed = np.maximum(
                        true_starts[global_idx] - pred_start,
                        pred_end - true_ends[global_idx],
                    )
                else:
                    raise ValueError(f"Unsupported interval mode: {mode!r}")

                for idx, k_val in zip(global_idx, k_needed):
                    pairs.append(
                        (
                            str(row.pred_id),
                            row.object_key,
                            str(true_ids[idx]),
                            str(gene_ids[idx]),
                            true_keys[idx],
                            int(k_val),
                        )
                    )

        return self._pair_records_to_df(pairs)

    # ------------------------------------------------------------------
    # Segmentation matching
    # ------------------------------------------------------------------

    def _collect_segmentation_pairs(
        self,
        base_pairs: pd.DataFrame,
        pred_parts: Dict[str, Dict[str, object]],
        true_parts: Dict[str, Dict[str, object]],
        part_name: str,
        match_mode: str,
        use_strand: bool,
        true_segmentation_keys: Dict[str, Tuple[object, ...]],
        pred_segmentation_keys: Dict[str, Tuple[object, ...]],
    ) -> pd.DataFrame:
        if base_pairs.empty:
            return self._empty_pair_df()

        pairs: List[Tuple[str, Tuple[object, ...], str, str, Tuple[object, ...], int]] = []

        for row in base_pairs.itertuples(index=False):
            pred_id = str(row.pred_id)
            true_tx_id = str(row.true_tx_id)

            pred_info = pred_parts.get(pred_id)
            true_info = true_parts.get(true_tx_id)
            if pred_info is None or true_info is None:
                continue

            if use_strand and str(pred_info.get("strand", "")) != str(true_info.get("strand", "")):
                continue

            pred_segments = pred_info.get(part_name, [])
            true_segments = true_info.get(part_name, [])
            if not self._segments_match(
                pred_segments=pred_segments,
                true_segments=true_segments,
                mode=match_mode,
            ):
                continue

            true_obj_key = true_segmentation_keys.get(true_tx_id)
            pred_obj_key = pred_segmentation_keys.get(pred_id)
            if true_obj_key is None or pred_obj_key is None:
                continue

            pairs.append(
                (
                    pred_id,
                    pred_obj_key,
                    true_tx_id,
                    str(row.gene_id),
                    true_obj_key,
                    int(row.k_needed),
                )
            )

        return self._pair_records_to_df(pairs)

    def _segments_match(
        self,
        pred_segments: List[Tuple[int, int]],
        true_segments: List[Tuple[int, int]],
        mode: str,
    ) -> bool:
        if not pred_segments or not true_segments:
            return False
        if len(pred_segments) != len(true_segments):
            return False

        if mode == "exact":
            return list(pred_segments) == list(true_segments)

        if mode == "exon":
            if len(true_segments) == 1:
                return True

            if int(pred_segments[0][1]) != int(true_segments[0][1]):
                return False
            if int(pred_segments[-1][0]) != int(true_segments[-1][0]):
                return False

            for pred_seg, true_seg in zip(pred_segments[1:-1], true_segments[1:-1]):
                if (int(pred_seg[0]), int(pred_seg[1])) != (int(true_seg[0]), int(true_seg[1])):
                    return False
            return True

        raise ValueError(f"Unsupported segmentation mode: {mode!r}")

    def _build_segmentation_keys(
        self,
        tx_df: pd.DataFrame,
        parts_info: Dict[str, Dict[str, object]],
        id_col: str,
        part_name: str,
        mode: str,
        use_strand: bool,
    ) -> Dict[str, Tuple[object, ...]]:
        key_map: Dict[str, Tuple[object, ...]] = {}

        for row in tx_df.itertuples(index=False):
            tx_id = str(getattr(row, id_col))
            info = parts_info.get(tx_id)
            if info is None:
                continue

            segments = tuple((int(a), int(b)) for a, b in info.get(part_name, []))
            if mode == "exon":
                key = self._make_segmentation_key(
                    seqid=str(row.seqid),
                    start=int(row.start),
                    end=int(row.end),
                    strand=str(row.strand),
                    segments=segments,
                    use_strand=use_strand,
                )
            elif mode == "exact":
                if part_name == "cds":
                    core_start, core_end = self._outer_bounds_from_segments(segments)
                    key = self._make_segmentation_key(
                        seqid=str(row.seqid),
                        start=core_start,
                        end=core_end,
                        strand=str(row.strand),
                        segments=segments,
                        use_strand=use_strand,
                    )
                else:
                    key = self._make_segmentation_key(
                        seqid=str(row.seqid),
                        start=int(row.start),
                        end=int(row.end),
                        strand=str(row.strand),
                        segments=segments,
                        use_strand=use_strand,
                    )
            else:
                raise ValueError(f"Unsupported segmentation key mode: {mode!r}")

            key_map[tx_id] = key

        return key_map

    def _outer_bounds_from_segments(
        self,
        segments: Tuple[Tuple[int, int], ...],
    ) -> Tuple[int, int]:
        if not segments:
            return (0, 0)
        starts = [int(start) for start, _ in segments]
        ends = [int(end) for _, end in segments]
        return int(min(starts)), int(max(ends))

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    def _calculate_pair_metrics_for_k(
        self,
        pairs: pd.DataFrame,
        all_pred_ids: List[str],
        all_true_genes: List[str],
        allowed_genes: Set[str],
    ) -> Dict[str, object]:
        matched_pred_ids = set()
        matched_true_genes = set()

        if not pairs.empty:
            matched_pred_ids = set(pairs["pred_id"].dropna().astype(str).tolist())
            matched_true_genes = set(pairs["gene_id"].dropna().astype(str).tolist())

        n_pred = int(len(all_pred_ids))
        n_true_genes = int(len(all_true_genes))
        n_allowed_genes = int(len(allowed_genes))

        matched_pred = int(len(matched_pred_ids))
        unmatched_pred = n_pred - matched_pred
        precision = matched_pred / n_pred if n_pred else 0.0

        matched_genes = int(len(matched_true_genes))
        unmatched_genes = n_true_genes - matched_genes
        recall = matched_genes / n_true_genes if n_true_genes else 0.0

        f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
        mi = self._calculate_mi_for_pairs(pairs=pairs, allowed_genes=allowed_genes)

        return {
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "precision_counts": {
                "matched_pred_transcripts": matched_pred,
                "unmatched_pred_transcripts": unmatched_pred,
                "total_pred_transcripts": n_pred,
            },
            "recall_counts": {
                "matched_true_genes": matched_genes,
                "unmatched_true_genes": unmatched_genes,
                "total_true_genes": n_true_genes,
            },
            "mi": int(mi),
            "allowed_genes": n_allowed_genes,
        }

    def _calculate_mi_for_pairs(
        self,
        pairs: pd.DataFrame,
        allowed_genes: Set[str],
    ) -> int:
        if pairs.empty or not allowed_genes:
            return 0

        pairs = pairs[pairs["gene_id"].isin(allowed_genes)].copy()
        if pairs.empty:
            return 0

        mi = 0
        for _, group in pairs.groupby("gene_id", sort=False):
            pred_keys = set(group["pred_obj_key"].tolist())
            true_keys = set(group["true_obj_key"].tolist())
            if len(pred_keys) >= 2 and len(true_keys) >= 2:
                mi += 1
        return int(mi)

    def _pairs_to_records(
        self,
        pairs: pd.DataFrame,
    ) -> List[Dict[str, object]]:
        records: List[Dict[str, object]] = []
        if pairs.empty:
            return records

        for row in pairs.itertuples(index=False):
            records.append(
                {
                    "pred_id": str(row.pred_id),
                    "pred_obj_key": row.pred_obj_key,
                    "true_tx_id": str(row.true_tx_id),
                    "gene_id": str(row.gene_id),
                    "true_obj_key": row.true_obj_key,
                    "k_needed": int(row.k_needed),
                }
            )
        return records

    def _find_allowed_genes(
        self,
        true_df: pd.DataFrame,
        key_col: str,
    ) -> Set[str]:
        allowed = set()
        if true_df.empty:
            return allowed

        for gene_id, group in true_df.groupby("gene_id", sort=False):
            unique_keys = set(group[key_col].tolist())
            if len(unique_keys) >= 2:
                allowed.add(str(gene_id))
        return allowed

    def _find_allowed_genes_from_key_map(
        self,
        true_tx: pd.DataFrame,
        key_map: Dict[str, Tuple[object, ...]],
    ) -> Set[str]:
        allowed = set()
        if true_tx.empty:
            return allowed

        for gene_id, group in true_tx.groupby("gene_id", sort=False):
            keys = {
                key_map[str(tx_id)]
                for tx_id in group["transcript_id"].dropna().astype(str).tolist()
                if str(tx_id) in key_map
            }
            if len(keys) >= 2:
                allowed.add(str(gene_id))
        return allowed

    # ------------------------------------------------------------------
    # Part-level exact metrics
    # ------------------------------------------------------------------

    def _build_part_level_table(
        self,
        transcripts_df: pd.DataFrame,
        parts_info: Dict[str, Dict[str, object]],
        id_col: str,
        part_name: str,
    ) -> pd.DataFrame:
        records: List[Dict[str, object]] = []

        for row in transcripts_df.itertuples(index=False):
            transcript_id = str(getattr(row, id_col))
            info = parts_info.get(transcript_id)
            if info is None:
                continue

            segments = info.get(part_name, [])
            for idx, (start, end) in enumerate(segments):
                records.append(
                    {
                        "seqid": str(row.seqid),
                        "start": int(start),
                        "end": int(end),
                        "strand": str(row.strand),
                        "part_id": f"{transcript_id}:{part_name}:{idx}",
                    }
                )

        if not records:
            return pd.DataFrame(columns=["seqid", "start", "end", "strand", "part_id"])
        return pd.DataFrame(records)

    def _build_exact_part_level_result(
        self,
        pred_parts_df: pd.DataFrame,
        true_parts_df: pd.DataFrame,
        use_strand: bool,
        part_name: str,
    ) -> Dict[str, object]:
        pred_keys = self._part_key_set(pred_parts_df, use_strand=use_strand)
        true_keys = self._part_key_set(true_parts_df, use_strand=use_strand)
        matched_keys = pred_keys & true_keys

        matched_count = int(len(matched_keys))
        n_pred = int(len(pred_keys))
        n_true = int(len(true_keys))

        pred_matched_key = "matched_pred"
        pred_unmatched_key = "unmatched_pred"
        pred_total_key = "total_pred"
        true_matched_key = "matched_true"
        true_unmatched_key = "unmatched_true"
        true_total_key = "total_true"

        unmatched_pred = n_pred - matched_count
        unmatched_true = n_true - matched_count
        precision = matched_count / n_pred if n_pred else 0.0
        recall = matched_count / n_true if n_true else 0.0
        f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)

        return {
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "precision_counts": {
                pred_matched_key: matched_count,
                pred_unmatched_key: unmatched_pred,
                pred_total_key: n_pred,
            },
            "recall_counts": {
                true_matched_key: matched_count,
                true_unmatched_key: unmatched_true,
                true_total_key: n_true,
            },
        }

    def _part_key_set(
        self,
        parts_df: pd.DataFrame,
        use_strand: bool,
    ) -> Set[Tuple[object, ...]]:
        if parts_df.empty:
            return set()

        cols = ["seqid", "start", "end", "strand"] if use_strand else ["seqid", "start", "end"]
        keys: Set[Tuple[object, ...]] = set()

        for row in parts_df[cols].itertuples(index=False, name=None):
            key = []
            for idx, value in enumerate(row):
                if idx == 0 or (use_strand and idx == len(row) - 1):
                    key.append("" if self._is_missing_value(value) else str(value))
                else:
                    key.append(int(value))
            keys.add(tuple(key))

        return keys

    # ------------------------------------------------------------------
    # GFF parsing and transcript extraction
    # ------------------------------------------------------------------

    def _read_gff(self, gff: Union[PathLike, pd.DataFrame]) -> pd.DataFrame:
        if isinstance(gff, pd.DataFrame):
            df = gff.copy()
        else:
            df = pd.read_csv(
                gff,
                sep="\t",
                names=self.GFF_COLUMNS,
                header=None,
                comment="#",
                dtype=str,
            )

        if df.empty:
            raise ValueError("GFF is empty")

        df["start"] = pd.to_numeric(df["start"], errors="raise").astype(int)
        df["end"] = pd.to_numeric(df["end"], errors="raise").astype(int)

        attrs = df["attributes"].fillna("").map(self._parse_attributes)
        attrs_df = pd.DataFrame(attrs.tolist())
        df = pd.concat([df.reset_index(drop=True), attrs_df.reset_index(drop=True)], axis=1)

        for col in ["ID", "Parent", "gene_id", "transcript_id", "gene_biotype", "__bare__"]:
            if col not in df.columns:
                df[col] = pd.Series([None] * len(df), index=df.index, dtype=object)

        df["type_lower"] = df["type"].astype(str).str.strip().str.lower()
        self._fill_missing_gff_identifiers(df)
        return df

    @classmethod
    def _parse_attributes(cls, attr: str) -> Dict[str, str]:
        result: Dict[str, str] = {}
        if not isinstance(attr, str) or not attr.strip():
            return result

        raw_attr = attr.strip()
        fields = [field.strip() for field in raw_attr.split(";") if field.strip()]

        if len(fields) == 1 and "=" not in fields[0] and " " not in fields[0]:
            result["__bare__"] = cls._clean_attr_value(fields[0])

        for field in fields:
            current = field.strip()
            if not current:
                continue

            if "=" in current:
                key, value = current.split("=", 1)
            elif " " in current:
                key, value = current.split(None, 1)
            else:
                result.setdefault("__bare__", cls._clean_attr_value(current))
                continue

            key = cls._clean_attr_value(key)
            value = cls._clean_attr_value(value)
            if key:
                result[key] = value

        return result

    @staticmethod
    def _clean_attr_value(value: object) -> str:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return ""

        text = str(value).strip()
        if not text:
            return ""

        text = text.replace('""', '"').strip()
        while text.startswith('"'):
            text = text[1:].strip()
        while text.endswith('"'):
            text = text[:-1].strip()
        text = text.replace('""', '"').strip()
        return text

    @staticmethod
    def _is_missing_value(value: object) -> bool:
        if value is None:
            return True
        try:
            if pd.isna(value):
                return True
        except TypeError:
            pass
        text = str(value).strip()
        return text == "" or text.lower() in {"none", "nan", "<na>"}

    def _fill_missing_gff_identifiers(self, df: pd.DataFrame) -> None:
        def fill_from_sources(mask: pd.Series, target_col: str, source_cols: List[str]) -> None:
            for source_col in source_cols:
                if source_col not in df.columns:
                    continue

                missing_mask = mask & df[target_col].map(self._is_missing_value)
                if not bool(missing_mask.any()):
                    break

                source_values = df.loc[missing_mask, source_col]
                good_mask = ~source_values.map(self._is_missing_value)
                if not bool(good_mask.any()):
                    continue

                good_index = source_values.index[good_mask]
                df.loc[good_index, target_col] = source_values.loc[good_index].map(self._clean_attr_value)

        gene_mask = df["type_lower"].isin(self.GENE_TYPES)
        tx_mask = df["type_lower"].isin(self.TRANSCRIPT_TYPES)
        part_mask = df["type_lower"].isin(self.PART_TYPES)

        fill_from_sources(gene_mask, "ID", ["gene_id", "__bare__"])
        fill_from_sources(gene_mask, "gene_id", ["ID"])

        fill_from_sources(tx_mask, "ID", ["transcript_id", "__bare__"])
        fill_from_sources(tx_mask, "transcript_id", ["ID"])
        fill_from_sources(tx_mask, "Parent", ["gene_id"])

        fill_from_sources(part_mask, "Parent", ["transcript_id"])

        self._infer_missing_transcript_gene_links(df)

        for col in ["ID", "Parent", "gene_id", "transcript_id", "gene_biotype"]:
            if col in df.columns:
                df[col] = df[col].map(
                    lambda x: None if self._is_missing_value(x) else self._clean_attr_value(x)
                )

    def _infer_missing_transcript_gene_links(self, df: pd.DataFrame) -> None:
        gene_rows = df[
            df["type_lower"].isin(self.GENE_TYPES)
            & ~df["ID"].map(self._is_missing_value)
        ][["seqid", "start", "end", "strand", "ID"]].copy()

        if gene_rows.empty:
            return

        tx_missing_mask = (
            df["type_lower"].isin(self.TRANSCRIPT_TYPES)
            & df["Parent"].map(self._is_missing_value)
        )
        if not bool(tx_missing_mask.any()):
            return

        for idx, row in df.loc[tx_missing_mask, ["seqid", "start", "end", "strand"]].iterrows():
            candidates = gene_rows[gene_rows["seqid"].astype(str) == str(row["seqid"])].copy()
            if candidates.empty:
                continue

            row_strand = str(row["strand"]) if not self._is_missing_value(row["strand"]) else ""
            if row_strand not in {"", "."}:
                candidates = candidates[candidates["strand"].astype(str).isin([row_strand, ".", ""])]
                if candidates.empty:
                    continue

            candidates = candidates[
                (candidates["start"].astype(int) <= int(row["start"]))
                & (candidates["end"].astype(int) >= int(row["end"]))
            ].copy()
            if candidates.empty:
                continue

            if len(candidates) > 1:
                span = candidates["end"].astype(int) - candidates["start"].astype(int)
                candidates = candidates.assign(__span=span).sort_values(
                    ["__span", "start", "end"],
                    kind="stable",
                )

            gene_id = self._clean_attr_value(candidates.iloc[0]["ID"])
            if gene_id:
                df.at[idx, "Parent"] = gene_id
                if self._is_missing_value(df.at[idx, "gene_id"]):
                    df.at[idx, "gene_id"] = gene_id

    def _get_parent_gene_ids(self, df: pd.DataFrame) -> pd.Series:
        parent_gene = df["Parent"].fillna("").astype(str).str.split(",").str[0]
        missing_gene = parent_gene == ""
        if "gene_id" in df.columns:
            parent_gene.loc[missing_gene] = df.loc[missing_gene, "gene_id"].fillna("").astype(str)
        return parent_gene

    def _select_gene_ids_by_biotype(
        self,
        df: pd.DataFrame,
        gene_biotypes: Set[str],
    ) -> Set[str]:
        gene_rows = df[df["type_lower"].isin(self.GENE_TYPES)].copy()
        if gene_rows.empty:
            return set()

        candidate_cols = ["gene_biotype", "gene_type", "biotype"]
        biotype_col = None
        for col in candidate_cols:
            if col in gene_rows.columns:
                biotype_col = col
                break

        if biotype_col is None:
            return set()

        biotype_values = gene_rows[biotype_col].fillna("").astype(str).str.strip().str.lower()
        mask = biotype_values.isin(gene_biotypes)
        return set(gene_rows.loc[mask, "ID"].dropna().astype(str))

    def _extract_true_transcript_rows(
        self,
        df: pd.DataFrame,
        gene_biotypes: Optional[Set[str]],
        transcript_types: Optional[Set[str]],
    ) -> pd.DataFrame:
        gene_ids = set(df.loc[df["type_lower"].isin(self.GENE_TYPES), "ID"].dropna().astype(str))
        parent_gene_ids = self._get_parent_gene_ids(df)

        transcript_like_mask = df["type_lower"].isin(self.TRANSCRIPT_TYPES)
        fallback_mask = (
            ~df["type_lower"].isin(self.GENE_TYPES)
            & ~df["type_lower"].isin(self.PART_TYPES)
            & parent_gene_ids.isin(gene_ids)
        )
        tx_mask = transcript_like_mask | fallback_mask

        if gene_biotypes is not None:
            allowed_gene_ids = self._select_gene_ids_by_biotype(df, gene_biotypes)
            gene_ids = gene_ids & allowed_gene_ids if gene_ids else allowed_gene_ids
            tx_mask = tx_mask & parent_gene_ids.isin(gene_ids)

        if transcript_types is not None:
            tx_mask = tx_mask & df["type_lower"].isin(transcript_types)

        tx = df.loc[
            tx_mask,
            ["seqid", "start", "end", "strand", "type_lower", "ID", "Parent", "gene_id", "transcript_id"],
        ].copy()

        if tx.empty:
            raise ValueError("Could not find transcript rows in true GFF.")

        tx["transcript_id_final"] = tx["ID"]
        missing_tx = tx["transcript_id_final"].isna() | (tx["transcript_id_final"].astype(str) == "")
        tx.loc[missing_tx, "transcript_id_final"] = tx.loc[missing_tx, "transcript_id"]

        missing_tx = tx["transcript_id_final"].isna() | (tx["transcript_id_final"].astype(str) == "")
        tx.loc[missing_tx, "transcript_id_final"] = "true_tx_" + tx.loc[missing_tx].index.astype(str)

        tx["gene_id_final"] = self._get_parent_gene_ids(tx)
        missing_gene = tx["gene_id_final"] == ""
        tx.loc[missing_gene, "gene_id_final"] = "gene_of_" + tx.loc[missing_gene, "transcript_id_final"].astype(str)

        tx = tx.drop_duplicates(subset=["transcript_id_final"]).reset_index(drop=True)
        return tx

    def _extract_pred_transcript_rows(self, df: pd.DataFrame) -> pd.DataFrame:
        gene_ids = set(df.loc[df["type_lower"].isin(self.GENE_TYPES), "ID"].dropna().astype(str))
        parent_gene_ids = self._get_parent_gene_ids(df)

        transcript_like_mask = df["type_lower"].isin(self.TRANSCRIPT_TYPES)
        fallback_mask = (
            ~df["type_lower"].isin(self.GENE_TYPES)
            & ~df["type_lower"].isin(self.PART_TYPES)
            & parent_gene_ids.isin(gene_ids)
        )
        tx_mask = transcript_like_mask | fallback_mask

        tx = df.loc[
            tx_mask,
            ["seqid", "start", "end", "strand", "type_lower", "ID", "Parent", "transcript_id"],
        ].copy()

        if tx.empty:
            raise ValueError("Could not find transcript rows in prediction GFF.")

        tx["pred_id"] = tx["ID"]
        missing_pred_id = tx["pred_id"].isna() | (tx["pred_id"].astype(str) == "")
        tx.loc[missing_pred_id, "pred_id"] = tx.loc[missing_pred_id, "transcript_id"]

        missing_pred_id = tx["pred_id"].isna() | (tx["pred_id"].astype(str) == "")
        tx.loc[missing_pred_id, "pred_id"] = "pred_tx_" + tx.loc[missing_pred_id].index.astype(str)

        tx = tx.drop_duplicates(subset=["pred_id"]).reset_index(drop=True)
        return tx

    def _true_rows_to_transcripts(self, tx: pd.DataFrame, use_strand: bool) -> pd.DataFrame:
        out = pd.DataFrame(
            {
                "seqid": tx["seqid"].to_numpy(),
                "start": tx["start"].to_numpy(dtype=int),
                "end": tx["end"].to_numpy(dtype=int),
                "strand": tx["strand"].to_numpy(),
                "transcript_id": tx["transcript_id_final"].astype(str).to_numpy(),
                "gene_id": tx["gene_id_final"].astype(str).to_numpy(),
            }
        )
        out["transcript_key"] = [
            self._make_interval_key(seqid, start, end, strand, use_strand)
            for seqid, start, end, strand in zip(out["seqid"], out["start"], out["end"], out["strand"])
        ]
        return out.reset_index(drop=True)

    def _pred_rows_to_transcripts(self, tx: pd.DataFrame, use_strand: bool) -> pd.DataFrame:
        out = pd.DataFrame(
            {
                "seqid": tx["seqid"].to_numpy(),
                "start": tx["start"].to_numpy(dtype=int),
                "end": tx["end"].to_numpy(dtype=int),
                "strand": tx["strand"].to_numpy(),
                "pred_id": tx["pred_id"].astype(str).to_numpy(),
            }
        )
        out["object_key"] = [
            self._make_interval_key(seqid, start, end, strand, use_strand)
            for seqid, start, end, strand in zip(out["seqid"], out["start"], out["end"], out["strand"])
        ]
        return out.reset_index(drop=True)

    def _extract_transcript_parts(
        self,
        df: pd.DataFrame,
        transcript_rows: pd.DataFrame,
        id_col: str,
        use_strand: bool,
    ) -> Dict[str, Dict[str, object]]:
        transcript_info: Dict[str, Dict[str, object]] = {}
        alias_to_final: Dict[str, str] = {}

        for row in transcript_rows.itertuples(index=False):
            final_id = str(getattr(row, id_col))
            strand = str(getattr(row, "strand"))

            transcript_info[final_id] = {
                "strand": strand,
                "exon": [],
                "cds": [],
            }

            aliases = {
                str(getattr(row, "ID")) if pd.notna(getattr(row, "ID")) else "",
                str(getattr(row, "transcript_id")) if pd.notna(getattr(row, "transcript_id")) else "",
                final_id,
            }
            for alias in {x for x in aliases if x not in {"", "None", "nan"}}:
                alias_to_final[alias] = final_id

        part_rows = df[df["type_lower"].isin(self.PART_TYPES)].copy()
        if part_rows.empty:
            return transcript_info

        for row in part_rows.itertuples(index=False):
            row_type = str(row.type_lower)

            parent_candidates: List[str] = []
            parent_value = "" if pd.isna(row.Parent) else str(row.Parent).strip()
            if parent_value:
                parent_candidates.extend([part.strip() for part in parent_value.split(",") if part.strip()])

            transcript_id_value = "" if pd.isna(row.transcript_id) else str(row.transcript_id).strip()
            if transcript_id_value:
                parent_candidates.append(transcript_id_value)

            seen = set()
            for parent in parent_candidates:
                if parent in seen:
                    continue
                seen.add(parent)

                final_id = alias_to_final.get(parent)
                if final_id is None:
                    continue
                transcript_info[final_id][row_type].append((int(row.start), int(row.end)))

        for final_id, info in transcript_info.items():
            # use_strand only adds strand equality in comparisons.
            # Segment order is always genomic order.
            for part_name in ["exon", "cds"]:
                info[part_name] = sorted(
                    {(int(start), int(end)) for start, end in info[part_name]},
                    key=lambda x: (x[0], x[1]),
                )

        return transcript_info

    def _filter_transcripts_with_part(
        self,
        transcripts_df: pd.DataFrame,
        parts_info: Dict[str, Dict[str, object]],
        id_col: str,
        part_name: str,
    ) -> pd.DataFrame:
        if transcripts_df.empty:
            return transcripts_df.copy()

        keep_mask = []
        for row in transcripts_df.itertuples(index=False):
            transcript_id = str(getattr(row, id_col))
            info = parts_info.get(transcript_id)
            segments = [] if info is None else info.get(part_name, [])
            keep_mask.append(bool(segments))

        return transcripts_df.loc[np.array(keep_mask, dtype=bool)].reset_index(drop=True)

    def _build_outer_part_interval_transcripts(
        self,
        transcripts_df: pd.DataFrame,
        parts_info: Dict[str, Dict[str, object]],
        id_col: str,
        part_name: str,
        keep_gene_id: bool,
        use_strand: bool,
    ) -> pd.DataFrame:
        records: List[Dict[str, object]] = []

        for row in transcripts_df.itertuples(index=False):
            transcript_id = str(getattr(row, id_col))
            info = parts_info.get(transcript_id)
            if info is None:
                continue

            segments = info.get(part_name, [])
            if not segments:
                continue

            starts = [int(start) for start, _ in segments]
            ends = [int(end) for _, end in segments]

            record: Dict[str, object] = {
                "seqid": str(row.seqid),
                "start": int(min(starts)),
                "end": int(max(ends)),
                "strand": str(row.strand),
                id_col: transcript_id,
            }
            record["object_key"] = self._make_interval_key(
                seqid=str(row.seqid),
                start=int(min(starts)),
                end=int(max(ends)),
                strand=str(row.strand),
                use_strand=use_strand,
            )
            if keep_gene_id:
                record["gene_id"] = str(row.gene_id)
                record["transcript_key"] = record["object_key"]
            records.append(record)

        if not records:
            if keep_gene_id:
                return pd.DataFrame(columns=["seqid", "start", "end", "strand", "transcript_id", "gene_id", "transcript_key", "object_key"])
            return pd.DataFrame(columns=["seqid", "start", "end", "strand", "pred_id", "object_key"])

        return pd.DataFrame(records).drop_duplicates(subset=[id_col]).reset_index(drop=True)

    # ------------------------------------------------------------------
    # Small helpers
    # ------------------------------------------------------------------


    def _make_interval_key(
        self,
        seqid: str,
        start: int,
        end: int,
        strand: str,
        use_strand: bool,
    ) -> Tuple[object, ...]:
        if use_strand:
            return (str(seqid), int(start), int(end), str(strand))
        return (str(seqid), int(start), int(end))

    def _make_segmentation_key(
        self,
        seqid: str,
        start: int,
        end: int,
        strand: str,
        segments: Tuple[Tuple[int, int], ...],
        use_strand: bool,
    ) -> Tuple[object, ...]:
        if use_strand:
            return (str(seqid), int(start), int(end), str(strand), segments)
        return (str(seqid), int(start), int(end), segments)

    def _normalize_k_values(self, k_values: Iterable[int]) -> List[int]:
        values = sorted({int(k) for k in k_values})
        if not values:
            raise ValueError("k_values is empty")
        if values[0] < 0:
            raise ValueError("k must be >= 0")
        return values

    def _normalize_string_filter(
        self,
        values: Optional[Union[str, Iterable[str]]],
    ) -> Optional[Set[str]]:
        if values is None:
            return None
        if isinstance(values, str):
            values = [values]
        normalized = {
            str(value).strip().lower()
            for value in values
            if str(value).strip() != ""
        }
        return normalized or None

    def _group_columns(self, use_strand: bool) -> List[str]:
        return ["seqid", "strand"] if use_strand else ["seqid"]

    def _empty_pair_df(self) -> pd.DataFrame:
        return pd.DataFrame(columns=self.PAIR_COLUMNS)

    def _pair_records_to_df(
        self,
        records: List[Tuple[str, Tuple[object, ...], str, str, Tuple[object, ...], int]],
    ) -> pd.DataFrame:
        if not records:
            return self._empty_pair_df()

        out = pd.DataFrame(records, columns=self.PAIR_COLUMNS)
        out = out.drop_duplicates(subset=self.PAIR_COLUMNS).reset_index(drop=True)
        return out



    # ------------------------------------------------------------------
    # Post-hoc utilities based on branch results
    # ------------------------------------------------------------------

    def build_stratifier(
        self,
        branch_result: Dict[int, Dict[str, object]],
        pred_gff: Union[PathLike, pd.DataFrame],
        true_gff: Union[PathLike, pd.DataFrame],
        use_strand: bool = False,
        gene_biotypes: Optional[Union[str, Iterable[str]]] = None,
        transcript_types: Optional[Union[str, Iterable[str]]] = None,
    ) -> Dict[str, Dict[str, Dict[int, Dict[str, object]]]]:
        context = self._prepare_posthoc_context(
            branch_result=branch_result,
            pred_gff=pred_gff,
            true_gff=true_gff,
            use_strand=use_strand,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
        )

        branch_data = context["branch_data"]
        analysis_true_ids = set(branch_data["true_analysis_tx"]["transcript_id"].dropna().astype(str).tolist())
        analysis_pred_ids = set(branch_data["pred_analysis_tx"]["pred_id"].dropna().astype(str).tolist())

        true_attr_maps = {
            "strand": self._attribute_map(context["common"]["true_tx_rows"], "transcript_id_final", "strand"),
            "chromosome": self._attribute_map(context["common"]["true_tx_rows"], "transcript_id_final", "seqid"),
            "transcript_type": self._attribute_map(context["common"]["true_tx_rows"], "transcript_id_final", "type_lower"),
        }
        pred_attr_maps = {
            "strand": self._attribute_map(context["common"]["pred_tx_rows"], "pred_id", "strand"),
            "chromosome": self._attribute_map(context["common"]["pred_tx_rows"], "pred_id", "seqid"),
            "transcript_type": self._attribute_map(context["common"]["pred_tx_rows"], "pred_id", "type_lower"),
        }

        stratifier: Dict[str, Dict[str, Dict[int, Dict[str, object]]]] = {}
        for group_name in ["strand", "chromosome", "transcript_type"]:
            true_group_map = true_attr_maps[group_name]
            pred_group_map = pred_attr_maps[group_name]

            if group_name == "transcript_type":
                group_values = sorted({
                    str(true_group_map[tx_id])
                    for tx_id in analysis_true_ids
                    if tx_id in true_group_map and str(true_group_map[tx_id]) != ""
                })
            else:
                group_values = sorted({
                    str(true_group_map[tx_id])
                    for tx_id in analysis_true_ids
                    if tx_id in true_group_map and str(true_group_map[tx_id]) != ""
                } | {
                    str(pred_group_map[pred_id])
                    for pred_id in analysis_pred_ids
                    if pred_id in pred_group_map and str(pred_group_map[pred_id]) != ""
                })

            grouped_results: Dict[str, Dict[int, Dict[str, object]]] = {}
            for group_value in group_values:
                true_ids = {
                    tx_id
                    for tx_id in analysis_true_ids
                    if str(true_group_map.get(tx_id, "")) == str(group_value)
                }
                pred_ids = {
                    pred_id
                    for pred_id in analysis_pred_ids
                    if str(pred_group_map.get(pred_id, "")) == str(group_value)
                }

                true_analysis_subset = self._subset_by_ids(
                    df=branch_data["true_analysis_tx"],
                    id_col="transcript_id",
                    selected_ids=true_ids,
                )
                pred_analysis_subset = self._subset_by_ids(
                    df=branch_data["pred_analysis_tx"],
                    id_col="pred_id",
                    selected_ids=pred_ids,
                )
                interval_true_subset = self._subset_by_ids(
                    df=branch_data["interval_true_tx"],
                    id_col="transcript_id",
                    selected_ids=true_ids,
                )
                seg_true_subset = self._subset_by_ids(
                    df=branch_data["true_seg_tx"],
                    id_col="transcript_id",
                    selected_ids=true_ids,
                )

                seg_keys_subset = {
                    tx_id: key
                    for tx_id, key in branch_data["true_segmentation_keys"].items()
                    if tx_id in true_ids
                }

                interval_allowed_genes = self._find_allowed_genes(interval_true_subset, key_col="object_key")
                segmentation_allowed_genes = self._find_allowed_genes_from_key_map(
                    true_tx=seg_true_subset,
                    key_map=seg_keys_subset,
                )

                all_pred_ids = pred_analysis_subset["pred_id"].dropna().astype(str).tolist()
                all_true_genes = sorted(true_analysis_subset["gene_id"].dropna().astype(str).unique().tolist())
                segmentation_all_true_genes = sorted(seg_true_subset["gene_id"].dropna().astype(str).unique().tolist())

                interval_group_pairs = self._filter_pairs(
                    pairs=context["interval_master_pairs"],
                    pred_ids=pred_ids,
                    true_tx_ids=true_ids,
                )
                segmentation_group_pairs = self._filter_pairs(
                    pairs=context["segmentation_master_pairs"],
                    pred_ids=pred_ids,
                    true_tx_ids=true_ids,
                )

                part_true_df = self._build_part_level_table(
                    transcripts_df=self._subset_by_ids(
                        df=branch_data["part_level_true_tx"],
                        id_col="transcript_id",
                        selected_ids=true_ids,
                    ),
                    parts_info=branch_data["true_parts"],
                    id_col="transcript_id",
                    part_name=branch_data["segmentation_part_name"],
                )
                part_pred_df = self._build_part_level_table(
                    transcripts_df=self._subset_by_ids(
                        df=branch_data["part_level_pred_tx"],
                        id_col="pred_id",
                        selected_ids=pred_ids,
                    ),
                    parts_info=branch_data["pred_parts"],
                    id_col="pred_id",
                    part_name=branch_data["segmentation_part_name"],
                )
                part_level_result = self._build_exact_part_level_result(
                    pred_parts_df=part_pred_df,
                    true_parts_df=part_true_df,
                    use_strand=bool(branch_data["use_strand"]),
                    part_name=str(branch_data["segmentation_part_name"]),
                )

                per_k_results: Dict[int, Dict[str, object]] = {}
                for k in context["k_values"]:
                    interval_pairs_k = self._filter_pairs(
                        pairs=interval_group_pairs,
                        pred_ids=pred_ids,
                        true_tx_ids=true_ids,
                        max_k=int(k),
                    )
                    interval_result = self._calculate_pair_metrics_for_k(
                        pairs=interval_pairs_k,
                        all_pred_ids=all_pred_ids,
                        all_true_genes=all_true_genes,
                        allowed_genes=interval_allowed_genes,
                    )
                    interval_result["matched_pairs"] = self._pairs_to_records(interval_pairs_k)

                    segmentation_pairs_k = self._filter_pairs(
                        pairs=segmentation_group_pairs,
                        pred_ids=pred_ids,
                        true_tx_ids=true_ids,
                        max_k=int(k),
                    )
                    segmentation_result = self._calculate_pair_metrics_for_k(
                        pairs=segmentation_pairs_k,
                        all_pred_ids=all_pred_ids,
                        all_true_genes=segmentation_all_true_genes,
                        allowed_genes=segmentation_allowed_genes,
                    )
                    segmentation_result["matched_pairs"] = self._pairs_to_records(segmentation_pairs_k)

                    per_k_results[int(k)] = {
                        "interval-level": interval_result,
                        "segmentation-level": segmentation_result,
                        "part-level": deepcopy(part_level_result),
                    }

                grouped_results[str(group_value)] = per_k_results

            stratifier[group_name] = grouped_results

        return stratifier

    def build_detailed_info(
        self,
        branch_result: Dict[int, Dict[str, object]],
        pred_gff: Union[PathLike, pd.DataFrame],
        true_gff: Union[PathLike, pd.DataFrame],
        use_strand: bool = False,
        gene_biotypes: Optional[Union[str, Iterable[str]]] = None,
        transcript_types: Optional[Union[str, Iterable[str]]] = None,
    ) -> Dict[str, Dict[str, object]]:
        context = self._prepare_posthoc_context(
            branch_result=branch_result,
            pred_gff=pred_gff,
            true_gff=true_gff,
            use_strand=use_strand,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
        )

        branch_data = context["branch_data"]
        true_analysis_tx = branch_data["true_analysis_tx"]
        interval_pairs = context["interval_master_pairs"]
        segmentation_pairs = context["segmentation_master_pairs"]

        interval_mi_k = self._mi_k_by_gene(
            pairs=interval_pairs,
            allowed_genes=branch_data["interval_allowed_genes"],
        )
        segmentation_mi_k = self._mi_k_by_gene(
            pairs=segmentation_pairs,
            allowed_genes=branch_data["segmentation_allowed_genes"],
        )

        true_type_map = self._attribute_map(
            context["common"]["true_tx_rows"],
            "transcript_id_final",
            "type_lower",
        )
        interval_pred_by_true = self._pred_min_k_by_true_tx(interval_pairs)
        segmentation_pred_by_true = self._pred_min_k_by_true_tx(segmentation_pairs)

        details: Dict[str, Dict[str, object]] = {}
        for row in true_analysis_tx.itertuples(index=False):
            true_tx_id = str(row.transcript_id)
            gene_id = str(row.gene_id)

            interval_predictions = [
                {"pred_id": str(pred_id), "min_k": int(min_k)}
                for pred_id, min_k in sorted(
                    interval_pred_by_true.get(true_tx_id, {}).items(),
                    key=lambda item: (int(item[1]), str(item[0])),
                )
            ]
            segmentation_predictions = [
                {"pred_id": str(pred_id), "min_k": int(min_k)}
                for pred_id, min_k in sorted(
                    segmentation_pred_by_true.get(true_tx_id, {}).items(),
                    key=lambda item: (int(item[1]), str(item[0])),
                )
            ]

            details[true_tx_id] = {
                "chromosome": str(row.seqid),
                "start": int(row.start),
                "end": int(row.end),
                "strand": str(row.strand),
                "gene_id": gene_id,
                "transcript_type": true_type_map.get(true_tx_id),
                "interval-level": {
                    "predictions": interval_predictions,
                    "gene_is_multisoform": gene_id in branch_data["interval_allowed_genes"],
                    "gene_contributes_to_mi": gene_id in interval_mi_k,
                    "mi_k": interval_mi_k.get(gene_id),
                },
                "segmentation-level": {
                    "predictions": segmentation_predictions,
                    "gene_is_multisoform": gene_id in branch_data["segmentation_allowed_genes"],
                    "gene_contributes_to_mi": gene_id in segmentation_mi_k,
                    "mi_k": segmentation_mi_k.get(gene_id),
                },
            }

        return details

    def _prepare_posthoc_context(
        self,
        branch_result: Dict[int, Dict[str, object]],
        pred_gff: Union[PathLike, pd.DataFrame],
        true_gff: Union[PathLike, pd.DataFrame],
        use_strand: bool,
        gene_biotypes: Optional[Union[str, Iterable[str]]],
        transcript_types: Optional[Union[str, Iterable[str]]],
    ) -> Dict[str, object]:
        if not branch_result:
            raise ValueError("branch_result is empty")

        k_values = self._normalize_k_values(branch_result.keys())
        first_k = int(k_values[0])

        for level_name in ["interval-level", "segmentation-level", "part-level"]:
            if level_name not in branch_result[first_k]:
                raise ValueError(f"branch_result does not contain {level_name!r}")

        common = self._prepare_common_data(
            pred_gff=pred_gff,
            true_gff=true_gff,
            k_values=k_values,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
            use_strand=use_strand,
        )

        branch_data = None
        observed_part_level = deepcopy(branch_result[first_k]["part-level"])
        for branch_name in ["exon", "cds"]:
            candidate = self._prepare_branch_data(common=common, use_strand=use_strand, branch=branch_name)
            if observed_part_level == deepcopy(candidate["part_level_result"]):
                branch_data = candidate
                break

        if branch_data is None:
            raise ValueError("Could not detect whether branch_result belongs to exon or cds branch")

        max_k = max(k_values)
        interval_master_pairs = self._records_to_pair_df(
            branch_result[int(max_k)]["interval-level"].get("matched_pairs", [])
        )
        segmentation_master_pairs = self._records_to_pair_df(
            branch_result[int(max_k)]["segmentation-level"].get("matched_pairs", [])
        )

        return {
            "k_values": k_values,
            "common": common,
            "branch_data": branch_data,
            "interval_master_pairs": interval_master_pairs,
            "segmentation_master_pairs": segmentation_master_pairs,
        }

    def _attribute_map(
        self,
        rows: pd.DataFrame,
        id_col: str,
        attr_name: str,
    ) -> Dict[str, str]:
        result: Dict[str, str] = {}
        if rows.empty:
            return result

        for row in rows.itertuples(index=False):
            obj_id = str(getattr(row, id_col))
            value = getattr(row, attr_name, "")
            result[obj_id] = "" if self._is_missing_value(value) else str(value)
        return result

    def _subset_by_ids(
        self,
        df: pd.DataFrame,
        id_col: str,
        selected_ids: Set[str],
    ) -> pd.DataFrame:
        if df.empty or not selected_ids:
            return df.iloc[0:0].copy()
        return df.loc[df[id_col].astype(str).isin(selected_ids)].reset_index(drop=True)

    def _records_to_pair_df(
        self,
        records: List[Dict[str, object]],
    ) -> pd.DataFrame:
        if not records:
            return self._empty_pair_df()
        return self._pair_records_to_df([
            (
                str(record["pred_id"]),
                record["pred_obj_key"],
                str(record["true_tx_id"]),
                str(record["gene_id"]),
                record["true_obj_key"],
                int(record["k_needed"]),
            )
            for record in records
        ])

    def _filter_pairs(
        self,
        pairs: pd.DataFrame,
        pred_ids: Optional[Set[str]] = None,
        true_tx_ids: Optional[Set[str]] = None,
        max_k: Optional[int] = None,
    ) -> pd.DataFrame:
        if pairs.empty:
            return self._empty_pair_df()

        mask = pd.Series(True, index=pairs.index)
        if pred_ids is not None:
            if not pred_ids:
                return self._empty_pair_df()
            mask &= pairs["pred_id"].astype(str).isin(pred_ids)
        if true_tx_ids is not None:
            if not true_tx_ids:
                return self._empty_pair_df()
            mask &= pairs["true_tx_id"].astype(str).isin(true_tx_ids)
        if max_k is not None:
            mask &= pairs["k_needed"].astype(int) <= int(max_k)
        return pairs.loc[mask].reset_index(drop=True)

    def _mi_k_by_gene(
        self,
        pairs: pd.DataFrame,
        allowed_genes: Set[str],
    ) -> Dict[str, int]:
        if pairs.empty or not allowed_genes:
            return {}

        filtered = pairs[pairs["gene_id"].isin(allowed_genes)].copy()
        if filtered.empty:
            return {}

        result: Dict[str, int] = {}
        for gene_id, group in filtered.groupby("gene_id", sort=False):
            pred_seen = set()
            true_seen = set()
            group = group.sort_values(["k_needed", "pred_id", "true_tx_id"], kind="stable")
            for row in group.itertuples(index=False):
                pred_seen.add(row.pred_obj_key)
                true_seen.add(row.true_obj_key)
                if len(pred_seen) >= 2 and len(true_seen) >= 2:
                    result[str(gene_id)] = int(row.k_needed)
                    break
        return result

    def _pred_min_k_by_true_tx(
        self,
        pairs: pd.DataFrame,
    ) -> Dict[str, Dict[str, int]]:
        result: Dict[str, Dict[str, int]] = {}
        if pairs.empty:
            return result

        grouped = pairs.groupby(["true_tx_id", "pred_id"], sort=False)["k_needed"].min().reset_index()
        for row in grouped.itertuples(index=False):
            true_tx_id = str(row.true_tx_id)
            pred_id = str(row.pred_id)
            result.setdefault(true_tx_id, {})[pred_id] = int(row.k_needed)
        return result


if __name__ == "__main__":
    gt_gff = "/home/jovyan/shares/SR003.nfs2/caduseus_artem/geo_dataset/caduseus_artem/chr20_filtered.gff"
    pred_gff = "/home/jovyan/shares/SR003.nfs2/caduseus_artem/geo_dataset/Hs_NC_060944.1_filtered.gff"
    #pred_gff = "/home/jovyan/shares/SR003.nfs2/caduseus_artem/geo_dataset/gff_Hs_NC_06944_1_helixer.gff"
    #pred_gff = "/home/jovyan/shares/SR003.nfs2/caduseus_artem/geo_dataset/tiberius_Hs_NC_060944.1.gtf"

    #pred_gff = "/home/jovyan/shares/SR003.nfs2/caduseus_artem/geo_dataset/test_pred.gff"
    #gt_gff = "/home/jovyan/shares/SR003.nfs2/caduseus_artem/geo_dataset/test_true.gff"

    evaluator = GeneLevelEvaluator()

    exon_result = evaluator.evaluate_gff_exon(
        pred_gff=pred_gff,
        true_gff=gt_gff,
        k_values=range(0, 501),
        use_strand=True,
        gene_biotypes=["protein_coding", "lncRNA"],
        transcript_types=["mRNA", "lnc_RNA"],
    )
    print(exon_result[250])
    exit()

    cds_result = evaluator.evaluate_gff_cds(
        pred_gff=pred_gff,
        true_gff=gt_gff,
        k_values=range(0, 501),
        use_strand=True,
        gene_biotypes=["protein_coding"],
        transcript_types=["mRNA"],
    )

    def remove_matched_pairs(obj):
        if isinstance(obj, dict):
            return {
                k: remove_matched_pairs(v)
                for k, v in obj.items()
                if k != "matched_pairs"
            }
        elif isinstance(obj, list):
            return [remove_matched_pairs(v) for v in obj]
        else:
            return obj

    exon_result = remove_matched_pairs(exon_result[250])
    print(exon_result)

    clean_result = remove_matched_pairs(cds_result[250])
    print(clean_result)
    exit()


    stratifier_output = evaluator.build_stratifier(
        branch_result=cds_result,
        pred_gff=pred_gff,
        true_gff=gt_gff,
        use_strand=True,
        gene_biotypes=["protein_coding"],
        transcript_types=["mRNA"],
    )

    detailed_info_output = evaluator.build_detailed_info(
        branch_result=cds_result,
        pred_gff=pred_gff,
        true_gff=gt_gff,
        use_strand=True,
        gene_biotypes=["protein_coding"],
        transcript_types=["mRNA"],
    )
    print('+')
    print(stratifier_output['strand']['+'][0])
    #print('-')
    #print(stratifier_output['strand']['-'][0])
    print(detailed_info_output)