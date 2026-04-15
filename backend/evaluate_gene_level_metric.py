from __future__ import annotations

from typing import Any

import datasets
import evaluate

from gene_level_final_final_fix import GeneLevelEvaluator

from backend.gff_io import gff_text_to_dataframe


class GenatatorGeneLevelMetric(evaluate.Metric):
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

        exon = evaluator.evaluate_gff_exon(
            pred_gff=gff_text_to_dataframe(pred_gff),
            true_gff=gff_text_to_dataframe(true_gff),
            k_values=k_values,
            use_strand=True,
            gene_biotypes=["protein_coding", "lncRNA"],
            transcript_types=["mRNA", "lnc_RNA"],
        )
        cds = evaluator.evaluate_gff_cds(
            pred_gff=gff_text_to_dataframe(pred_gff),
            true_gff=gff_text_to_dataframe(true_gff),
            k_values=k_values,
            use_strand=True,
            gene_biotypes=["protein_coding"],
            transcript_types=["mRNA"],
        )
        return {"k_values": k_values, "exon": exon, "cds": cds}
