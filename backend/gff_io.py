from __future__ import annotations

from io import StringIO

import pandas as pd

from gene_level_final_final_fix import GeneLevelEvaluator


def gff_text_to_dataframe(text: str) -> pd.DataFrame:
    """Parse raw GFF/GFF3 text into a DataFrame compatible with GeneLevelEvaluator."""
    return pd.read_csv(
        StringIO(text),
        sep="\t",
        names=GeneLevelEvaluator.GFF_COLUMNS,
        header=None,
        comment="#",
        dtype=str,
    )
