from __future__ import annotations

from typing import Any
from pathlib import Path

import datasets
import evaluate

from gene_level_final_final_fix import GeneLevelEvaluator

from backend.gff_io import gff_text_to_dataframe


class GenatatorGeneLevelMetric(evaluate.Metric):
    def _resolve_gff_source(self, value: str) -> str:
        """Treat input as a file path when it exists, otherwise as raw GFF text."""
        candidate = Path(value)
        if candidate.exists() and candidate.is_file():
            return candidate.read_text()
        return value

    def _info(self) -> evaluate.MetricInfo:
        return evaluate.MetricInfo(
            description="GENATATOR gene-level GFF metric (exon/CDS branches).",
            citation="",
            inputs_description="Provide prediction and reference GFF text or paths.",
            features=datasets.Features(
                {
                    "pred_gff": datasets.Value("string"),
                    "true_gff": datasets.Value("string"),
                }
            ),
        )

    def _compute(
        self,
        pred_gff: str,
        true_gff: str,
        k_values: list[int] | None = None,
    ) -> dict[str, Any]:
        evaluator = GeneLevelEvaluator()
        k_values = k_values or list(range(0, 501))
        pred_gff_text = self._resolve_gff_source(pred_gff)
        true_gff_text = self._resolve_gff_source(true_gff)
        pred_df = gff_text_to_dataframe(pred_gff_text)
        true_df = gff_text_to_dataframe(true_gff_text)

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
        exon_stratifier = evaluator.build_stratifier(
            branch_result=exon,
            pred_gff=pred_df,
            true_gff=true_df,
            use_strand=True,
            gene_biotypes=["protein_coding", "lncRNA"],
            transcript_types=["mRNA", "lnc_RNA"],
        )
        cds_stratifier = evaluator.build_stratifier(
            branch_result=cds,
            pred_gff=pred_df,
            true_gff=true_df,
            use_strand=True,
            gene_biotypes=["protein_coding"],
            transcript_types=["mRNA"],
        )
        exon_detailed = evaluator.build_detailed_info(
            branch_result=exon,
            pred_gff=pred_df,
            true_gff=true_df,
            use_strand=True,
            gene_biotypes=["protein_coding", "lncRNA"],
            transcript_types=["mRNA", "lnc_RNA"],
        )
        cds_detailed = evaluator.build_detailed_info(
            branch_result=cds,
            pred_gff=pred_df,
            true_gff=true_df,
            use_strand=True,
            gene_biotypes=["protein_coding"],
            transcript_types=["mRNA"],
        )
        return {
            "k_values": k_values,
            "exon": exon,
            "cds": cds,
            "stratifier": {"exon": exon_stratifier, "cds": cds_stratifier},
            "detailed": {"exon": exon_detailed, "cds": cds_detailed},
        }
