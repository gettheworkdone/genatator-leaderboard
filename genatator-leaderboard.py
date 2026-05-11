from __future__ import annotations

from pathlib import Path
from typing import Any
import importlib.util
import sys

import datasets
import evaluate
from huggingface_hub import hf_hub_download


def _load_symbol(module_rel_path: str, symbol_name: str):
    root = Path(__file__).resolve().parent
    module_path = root / module_rel_path
    if not module_path.exists():
        downloaded = hf_hub_download(
            repo_id="shmelev/genatator-leaderboard",
            filename=module_rel_path,
            repo_type="space",
        )
        module_path = Path(downloaded)
    module_name = module_path.stem
    if str(module_path.parent) not in sys.path:
        sys.path.insert(0, str(module_path.parent))
    if module_name in sys.modules:
        module = sys.modules[module_name]
        return getattr(module, symbol_name)

    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return getattr(module, symbol_name)


class GenatatorLeaderboardMetric(evaluate.Metric):
    def compute(self, *, pred_gff: str, true_gff: str, **kwargs) -> dict[str, Any]:
        """
        Bypass evaluate's batch-length validation for string path inputs.
        """
        return self._compute(pred_gff=pred_gff, true_gff=true_gff, **kwargs)

    def _resolve_gff_source(self, value: str) -> str:
        candidate = Path(value)
        if candidate.exists() and candidate.is_file():
            return candidate.read_text()
        return value

    def _info(self) -> evaluate.MetricInfo:
        return evaluate.MetricInfo(
            description="GENATATOR gene-level GFF metric (exon/CDS branches).",
            citation="",
            inputs_description="Provide prediction and reference GFF text or paths.",
            features=datasets.Features({"pred_gff": datasets.Value("string"), "true_gff": datasets.Value("string")}),
        )

    def _compute(
        self,
        pred_gff: str,
        true_gff: str,
        k_values: list[int] | None = None,
        use_strand: bool = True,
        gene_biotypes: list[str] | None = None,
        transcript_types: list[str] | None = None,
    ) -> dict[str, Any]:
        GeneLevelEvaluator = _load_symbol("gene_level_final_final_fix.py", "GeneLevelEvaluator")
        gff_text_to_dataframe = _load_symbol("backend/gff_io.py", "gff_text_to_dataframe")

        evaluator = GeneLevelEvaluator()
        k_values = k_values or list(range(0, 501))
        gene_biotypes = gene_biotypes or ["protein_coding", "lncRNA"]
        transcript_types = transcript_types or ["mRNA", "lnc_RNA"]
        pred_df = gff_text_to_dataframe(self._resolve_gff_source(pred_gff))
        true_df = gff_text_to_dataframe(self._resolve_gff_source(true_gff))

        exon = evaluator.evaluate_gff_exon(
            pred_gff=pred_df,
            true_gff=true_df,
            k_values=k_values,
            use_strand=use_strand,
            gene_biotypes=gene_biotypes,
            transcript_types=transcript_types,
        )
        cds = evaluator.evaluate_gff_cds(
            pred_gff=pred_df,
            true_gff=true_df,
            k_values=k_values,
            use_strand=use_strand,
            gene_biotypes=["protein_coding"],
            transcript_types=["mRNA"],
        )
        return {
            "k_values": k_values,
            "exon": exon,
            "cds": cds,
            "stratifier": {
                "exon": evaluator.build_stratifier(exon, pred_df, true_df, use_strand, gene_biotypes, transcript_types),
                "cds": evaluator.build_stratifier(cds, pred_df, true_df, use_strand, ["protein_coding"], ["mRNA"]),
            },
            "detailed": {
                "exon": evaluator.build_detailed_info(exon, pred_df, true_df, use_strand, gene_biotypes, transcript_types),
                "cds": evaluator.build_detailed_info(cds, pred_df, true_df, use_strand, ["protein_coding"], ["mRNA"]),
            },
        }
