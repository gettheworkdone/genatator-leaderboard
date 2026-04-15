from __future__ import annotations

from io import StringIO
from typing import Any

import pandas as pd

from gene_level_final_final_fix import GeneLevelEvaluator


def gff_text_to_dataframe_with_report(text: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Parse raw GFF/GFF3 text into a DataFrame and include cleanup diagnostics."""
    df = pd.read_csv(
        StringIO(text),
        sep="\t",
        names=GeneLevelEvaluator.GFF_COLUMNS,
        header=None,
        comment="#",
        dtype=str,
    )
    report: dict[str, Any] = {
        "raw_rows": int(len(df)),
        "kept_rows": 0,
        "dropped_rows": 0,
    }
    if df.empty:
        return df, report

    for column in ("start", "end"):
        numeric = pd.to_numeric(df[column], errors="coerce")
        numeric = numeric.where(numeric.notna(), other=pd.NA)
        numeric = numeric.where(~numeric.isin([float("inf"), float("-inf")]), other=pd.NA)
        df[column] = numeric

    before = len(df)
    df = df[df["start"].notna() & df["end"].notna()].copy()
    report["kept_rows"] = int(len(df))
    report["dropped_rows"] = int(before - len(df))
    if df.empty:
        return df, report

    df["start"] = df["start"].astype(int).astype(str)
    df["end"] = df["end"].astype(int).astype(str)
    return df, report


def gff_text_to_dataframe(text: str) -> pd.DataFrame:
    """Parse raw GFF/GFF3 text into a DataFrame compatible with GeneLevelEvaluator."""
    return gff_text_to_dataframe_with_report(text)[0]
