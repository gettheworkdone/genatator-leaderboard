from __future__ import annotations

from pathlib import Path
from typing import Any
import importlib.util

import datasets
import evaluate


def _load_symbol(module_rel_path: str, symbol_name: str):
    root = Path(__file__).resolve().parent
    module_path = root / module_rel_path
    spec = importlib.util.spec_from_file_location(f"_genatator_{module_path.stem}", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, symbol_name)


class GenatatorLeaderboardMetric(evaluate.Metric):
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
    ) -> dict[str, Any]:
        GeneLevelEvaluator = _load_symbol("gene_level_final_final_fix.py", "GeneLevelEvaluator")
        gff_text_to_dataframe = _load_symbol("backend/gff_io.py", "gff_text_to_dataframe")

        evaluator = GeneLevelEvaluator()
        k_values = k_values or list(range(0, 501))
        pred_df = gff_text_to_dataframe(self._resolve_gff_source(pred_gff))
        true_df = gff_text_to_dataframe(self._resolve_gff_source(true_gff))

        exon = evaluator.evaluate_gff_exon(
            pred_gff=pred_df,
            true_gff=true_df,
            k_values=k_values,
            use_strand=True,
            gene_biotypes=["protein_coding", "lncRNA"],
            transcript_types=["mRNA", "lnc_RNA"],
        )
        cds = evaluator.evaluate_gff_cds(
            pred_gff=pred_df,
            true_gff=true_df,
            k_values=k_values,
            use_strand=True,
            gene_biotypes=["protein_coding"],
            transcript_types=["mRNA"],
        )
        return {
            "k_values": k_values,
            "exon": exon,
            "cds": cds,
            "stratifier": {
                "exon": evaluator.build_stratifier(exon, pred_df, true_df, True, ["protein_coding", "lncRNA"], ["mRNA", "lnc_RNA"]),
                "cds": evaluator.build_stratifier(cds, pred_df, true_df, True, ["protein_coding"], ["mRNA"]),
            },
            "detailed": {
                "exon": evaluator.build_detailed_info(exon, pred_df, true_df, True, ["protein_coding", "lncRNA"], ["mRNA", "lnc_RNA"]),
                "cds": evaluator.build_detailed_info(cds, pred_df, true_df, True, ["protein_coding"], ["mRNA"]),
            },
        }

