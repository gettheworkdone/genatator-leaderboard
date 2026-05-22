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

```python
# How to use this metric with Hugging Face Evaluate
#
# This metric supports a Python API through Hugging Face Evaluate.
#
# Install dependencies:
#   pip install evaluate
#
# Load the metric from the Hugging Face repository:
#   shmelev/genatator-leaderboard
#
# The metric expects local GFF/GFF3-style files.
# Pass file paths as plain strings.
#
# Main parameters:
#   pred_gff: path to the prediction GFF/GFF3 file.
#   true_gff: path to the ground-truth GFF/GFF3 file.
#   k_values: list of boundary tolerances, in base pairs.
#             For example, [0, 50, 100, 250, 500].
#   use_strand: whether strand must match between prediction and reference.
#               Use True for strand-aware evaluation.
#               Use False for models that do not report strand information.
#   transcript_types: optional filter for transcript types.
#                     For example, ["mRNA"] or ["mRNA", "lnc_RNA"].
#
# Leaderboard-style setup:
#   use_strand=True
#   exon branch: mRNA and lnc_RNA transcripts
#   CDS branch: mRNA transcripts with annotated CDS
#
# The result contains:
#   result["exon"]            -> exon-branch metrics by k
#   result["cds"]             -> CDS-branch metrics by k
#   result["stratifier"]      -> grouped metrics by strand, chromosome, and transcript type
#   result["detailed"]        -> transcript-level matching information
#   result["annotated_genes"] -> annotated-gene counts by strand, chromosome, and transcript type

import evaluate

metric = evaluate.load("shmelev/genatator-leaderboard")

pred_gff_path = "/tmp/predictions.gff"
true_gff_path = "/tmp/reference.gff"


# ---------------------------------------------------------------------
# 1) Leaderboard-style evaluation
# ---------------------------------------------------------------------
# This evaluates both exon and CDS branches and returns all output blocks.

result = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=list(range(0, 501)),
    use_strand=True,
)

k = 250


# ---------------------------------------------------------------------
# 2) Main exon-branch scores
# ---------------------------------------------------------------------

print("Exon interval F1:", result["exon"][k]["interval-level"]["f1"])
print("Exon segmentation F1:", result["exon"][k]["segmentation-level"]["f1"])
print("Exon interval MI:", result["exon"][k]["interval-level"]["mi"])
print("Exon segmentation MI:", result["exon"][k]["segmentation-level"]["mi"])
print("Exon exact part F1:", result["exon"][k]["part-level"]["f1"])


# ---------------------------------------------------------------------
# 3) Main CDS-branch scores
# ---------------------------------------------------------------------

print("CDS interval F1:", result["cds"][k]["interval-level"]["f1"])
print("CDS segmentation F1:", result["cds"][k]["segmentation-level"]["f1"])
print("CDS interval MI:", result["cds"][k]["interval-level"]["mi"])
print("CDS segmentation MI:", result["cds"][k]["segmentation-level"]["mi"])
print("CDS exact part F1:", result["cds"][k]["part-level"]["f1"])


# ---------------------------------------------------------------------
# 4) Annotated genes
# ---------------------------------------------------------------------
# Annotated genes are counted after final transcript recovery rules:
#   - mRNA genes require the same prediction to recover both exon and CDS
#     segmentation for the same reference transcript.
#   - lnc_RNA and other non-mRNA transcript types use exon segmentation.

annotated_genes = result["annotated_genes"]

print("Annotated-gene grouping blocks:", annotated_genes.keys())
print("Annotated transcript-type groups:", annotated_genes["transcript_type"].keys())

print("Annotated mRNA genes at k = 250:")
print(annotated_genes["transcript_type"]["mrna"][k]["count"])

print("Annotated lnc_RNA genes at k = 250:")
print(annotated_genes["transcript_type"]["lnc_rna"][k]["count"])

if "+" in annotated_genes["strand"]:
    print("Annotated genes on + strand at k = 250:")
    print(annotated_genes["strand"]["+"][k]["count"])

if "-" in annotated_genes["strand"]:
    print("Annotated genes on - strand at k = 250:")
    print(annotated_genes["strand"]["-"][k]["count"])

if "NC_060944.1" in annotated_genes["chromosome"]:
    print("Annotated genes on chromosome NC_060944.1 at k = 250:")
    print(annotated_genes["chromosome"]["NC_060944.1"][k]["count"])


# ---------------------------------------------------------------------
# 5) Evaluation without strand matching
# ---------------------------------------------------------------------
# Use this for models that do not provide strand information,
# for example SegmentNT-like or NTv3-like outputs.

result_no_strand = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=[0, 50, 100, 250, 500],
    use_strand=False,
)

print("Exon interval F1 without strand at k = 250:")
print(result_no_strand["exon"][250]["interval-level"]["f1"])


# ---------------------------------------------------------------------
# 6) Custom transcript-type filtering
# ---------------------------------------------------------------------
# Use transcript_types to restrict the evaluation to selected transcript classes.

result_mrna_only = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=[250],
    use_strand=True,
    transcript_types=["mRNA"],
)

print("mRNA-only exon segmentation F1:")
print(result_mrna_only["exon"][250]["segmentation-level"]["f1"])

print("mRNA-only CDS segmentation F1:")
print(result_mrna_only["cds"][250]["segmentation-level"]["f1"])


# ---------------------------------------------------------------------
# 7) Stratifier output
# ---------------------------------------------------------------------
# Stratifier returns the same branch-specific metrics grouped by:
#   strand
#   chromosome
#   transcript_type

print("Exon metrics for mRNA transcripts at k = 250:")
print(result["stratifier"]["exon"]["transcript_type"]["mrna"][250])

if "+" in result["stratifier"]["exon"]["strand"]:
    print("Exon metrics for + strand at k = 250:")
    print(result["stratifier"]["exon"]["strand"]["+"][250])

if "NC_060944.1" in result["stratifier"]["cds"]["chromosome"]:
    print("CDS metrics for chromosome NC_060944.1 at k = 250:")
    print(result["stratifier"]["cds"]["chromosome"]["NC_060944.1"][250])


# ---------------------------------------------------------------------
# 8) Detailed transcript-level output
# ---------------------------------------------------------------------
# Detailed output shows which predictions matched each ground-truth transcript
# and the minimum k value required for each match.

detailed_exon = result["detailed"]["exon"]
detailed_cds = result["detailed"]["cds"]

print("Number of exon-detailed transcripts:")
print(len(detailed_exon))

print("First three exon transcript IDs:")
print(list(detailed_exon.keys())[:3])

first_exon_tx_id = list(detailed_exon.keys())[0]
print("First exon-detailed transcript record:")
print(detailed_exon[first_exon_tx_id])

print("Number of CDS-detailed transcripts:")
print(len(detailed_cds))

if detailed_cds:
    first_cds_tx_id = list(detailed_cds.keys())[0]
    print("First CDS-detailed transcript record:")
    print(detailed_cds[first_cds_tx_id])


# ---------------------------------------------------------------------
# 9) Annotated transcript details
# ---------------------------------------------------------------------
# Annotated transcript details identify prediction IDs that satisfy the
# final transcript annotation rule for each reference transcript.

annotated_transcripts = result["detailed"].get("annotated_transcripts", {})

if annotated_transcripts:
    print("Number of annotated transcript-detail records:")
    print(len(annotated_transcripts))

    first_annotated_tx_id = list(annotated_transcripts.keys())[0]
    print("First annotated transcript-detail record:")
    print(annotated_transcripts[first_annotated_tx_id])

    print("Predictions that annotate this transcript:")
    print(annotated_transcripts[first_annotated_tx_id].get("annotated_transcripts", []))
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
