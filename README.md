---
title: GENATATOR Gene-level Metric + Leaderboard
emoji: 🧬
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
short_description: Gene-level leaderboard for ab initio genome annotation
---

# GENATATOR gene-level metric and leaderboard

This Hugging Face Space provides a biologically rigorous leaderboard for evaluating **ab initio genome annotation** models with a fixed gene-level metric implementation.

## What is included

The repository contains two interface sections:

1. **Metric description** — scientific explanation of the metric together with a GFF-only playground.
2. **API + leaderboard** — an interactive leaderboard with summary tables, curves over `k = 0..500`, full metrics at any selected `k`, stratified analysis, and transcript-level inspection of matched predictions.

The backend uses the provided file `gene_level_final_final_fix.py` unchanged as the metric engine for exon and CDS evaluation, stratification, and transcript-level details.

## Scientific scope

The leaderboard is designed to favor **biologically meaningful transcript reconstruction** over token-level surrogates. It reports:

- interval-level precision, recall, F1, and multi-isoform score (MI)
- stricter segmentation-level precision, recall, F1, and MI
- exact part-level precision, recall, and F1 for exons or CDS parts

Two branches are exposed throughout the interface:

- **Exon branch** — evaluates exon reconstruction for `mRNA` and `lnc_RNA`
- **CDS branch** — evaluates coding-sequence reconstruction for `mRNA`

## Bundled leaderboard files

The archive includes bundled prediction files under `leaderboard_data/predictions/` and a local model-name mapping file at:

- `leaderboard_data/model_name_mapping.json`

At the time this archive was produced, the bundled permanent predictions correspond to the files available in the public repository used for leaderboard submissions.

## Ground truth file

The benchmark ground-truth file is **not** included in this archive because it will be added manually afterward.

Place:

- `chr20.gff`

into:

- `leaderboard_data/ground_truth/`

so that the final path is:

- `leaderboard_data/ground_truth/chr20.gff`

If the file is missing, the Space still starts, but the leaderboard remains in a waiting state until the file is added and the service is reloaded or restarted.

## Temporary custom uploads

Users can upload a temporary prediction GFF together with a model name. The uploaded model:

- is processed in memory only
- appears across all leaderboard panels after computation
- disappears after a Space restart

To add a model permanently to the public leaderboard, submit a pull request to the public prediction repository used by this Space.

## Local run

```bash
docker build -t genatator-gene-level-space .
docker run -p 7860:7860 genatator-gene-level-space
```

Then open `http://localhost:7860`.
