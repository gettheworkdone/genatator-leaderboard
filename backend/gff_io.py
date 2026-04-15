from __future__ import annotations

from io import StringIO

import pandas as pd

from gene_level_final_final_fix import GeneLevelEvaluator


def gff_text_to_dataframe(text: str) -> pd.DataFrame:
    """Parse raw GFF/GFF3 text into a DataFrame compatible with GeneLevelEvaluator."""
    df = pd.read_csv(
        StringIO(text),
        sep="\t",
        names=GeneLevelEvaluator.GFF_COLUMNS,
        header=None,
        comment="#",
        dtype=str,
    )
    if df.empty:
        return df

    for column in ("start", "end"):
        numeric = pd.to_numeric(df[column], errors="coerce")
        numeric = numeric.where(numeric.notna(), other=pd.NA)
        numeric = numeric.where(~numeric.isin([float("inf"), float("-inf")]), other=pd.NA)
        df[column] = numeric

    df = df[df["start"].notna() & df["end"].notna()].copy()
    if df.empty:
        return df

    df["start"] = df["start"].astype(int).astype(str)
    df["end"] = df["end"].astype(int).astype(str)
    return df


def gff_text_to_dataframe_with_report(text: str) -> tuple[pd.DataFrame, dict[str, int]]:
    """Backward-compatible helper kept for older imports."""
    df = gff_text_to_dataframe(text)
    return df, {"raw_rows": int(len(df)), "kept_rows": int(len(df)), "dropped_rows": 0}
