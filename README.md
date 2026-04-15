---
title: Ab Initio Leaderboard and Metric
emoji: 🧬
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
short_description: Ab initio genome annotation metric and leaderboard
---

# Ab Initio Leaderboard and Metric

This Hugging Face Space provides a transcript-centered benchmark for **ab initio genome annotation** with a fixed metric engine.

## What is included

The repository contains two interface sections:

1. **Metric description** — scientific rationale plus a GFF playground.
2. **Leaderboard** — summary tables, curves over `k = 0..500`, full metrics at any selected Active k, stratified analysis, and transcript-level inspection.

The backend uses `gene_level_final_final_fix.py` unchanged as the metric engine for exon and CDS evaluation, stratification, and transcript-level details.

## Metric description

The benchmark is designed to evaluate biologically meaningful transcript recovery rather than token-level agreement. It reports interval-level metrics, stricter segmentation-level metrics, and part-level diagnostics, across exon and CDS branches with tolerance parameter `k`.

## Leaderboard description

The leaderboard is intended as a scientific comparison framework, not only a rank list. It combines curve-based evaluation over `k` with branch-specific summaries and transcript-resolved evidence so users can trace model differences to specific biological structures.

## How to use this metric with Evaluate

Load the version you need (python or `.gff` mode) and run evaluation.

### Python-like mode

```python
import evaluate

metric = evaluate.load("shmelev/gene-level-metric", revision="metric-only")

result = metric.compute_gene_level_python(
    preds=[
        [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
            [1, 1],
            [1, 1],
            [0, 0],
            [0, 0],
        ]
    ],
    targets=[
        [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
            [1, 1],
            [1, 1],
            [0, 0],
            [0, 0],
        ]
    ],
    mapping=[
        "TX0001|GENE0001|mRNA|+|GRCh38|chr1|1:8",
    ],
    stratifier="type",
    types=["mRNA", "lnc_RNA"],
    segments=["exon", "CDS"],
)

print(result)
```

### GFF mode

```python
import evaluate

metric = evaluate.load("shmelev/gene-level-metric", revision="metric-only")

result = metric.compute_gene_level_gff(
    pred_gff="<predictions.gff>",
    true_gff="<reference.gff>",
    stratifier="type",
    types=["mRNA", "lnc_RNA"],
    segments=["exon", "CDS"],
)

print(result)
```

## Permanent predictions source

Permanent predictions and mapping are pulled automatically from:

- `https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git`

## Ground truth file

Place:

- `chr20.gff`

into:

- `leaderboard_data/ground_truth/`

so that the final path is:

- `leaderboard_data/ground_truth/chr20.gff`

## Local run

```bash
docker build -t genatator-gene-level-space .
docker run -p 7860:7860 genatator-gene-level-space
```

Then open `http://localhost:7860`.
