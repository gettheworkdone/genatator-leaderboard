import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import CalculateIcon from "@mui/icons-material/Calculate";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
const EVALUATE_SNIPPET = `How to use this metric with Evaluate
Load the version you need (python or .gff mode) and run evaluation.

Python-like mode
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

GFF mode
import evaluate

metric = evaluate.load("shmelev/gene-level-metric", revision="metric-only")

result = metric.compute_gene_level_gff(
    pred_gff="<predictions.gff>",
    true_gff="<reference.gff>",
    stratifier="type",
    types=["mRNA", "lnc_RNA"],
    segments=["exon", "CDS"],
)

print(result)`;

function SectionTitle({ icon = null, title, subtitle = null }) {
  return (
    <Stack spacing={0.6}>
      <Stack direction="row" spacing={1} alignItems="center">
        {icon}
        <Typography variant="h5">{title}</Typography>
      </Stack>
      {subtitle ? <Typography color="text.secondary">{subtitle}</Typography> : null}
    </Stack>
  );
}

function CodePanel({ children }) {
  return (
    <Box component="pre" className="code-panel mono">
      {children}
    </Box>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Box className="summary-chip-box">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Box>
  );
}

function formatScore(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return Number(value).toFixed(digits);
}

export default function MetricPage() {
  const [predFile, setPredFile] = useState(null);
  const [trueFile, setTrueFile] = useState(null);
  const [selectedKInput, setSelectedKInput] = useState("250");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const predInputRef = useRef(null);
  const trueInputRef = useRef(null);

  const selectedMetrics = useMemo(() => {
    if (!result) {
      return null;
    }
    const parsed = Number(selectedKInput);
    const k = Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 500)) : 0;
    return {
      exon: result.exon?.[k],
      cds: result.cds?.[k],
      k,
    };
  }, [result, selectedKInput]);

  const reset = () => {
    setPredFile(null);
    setTrueFile(null);
    setResult(null);
    setError("");
    if (predInputRef.current) predInputRef.current.value = "";
    if (trueInputRef.current) trueInputRef.current.value = "";
  };

  const compute = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      if (!predFile || !trueFile) {
        throw new Error("Please choose both prediction and ground-truth GFF files.");
      }
      const pred_gff_text = await predFile.text();
      const true_gff_text = await trueFile.text();
      const response = await fetch("/api/playground/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pred_gff_text,
          true_gff_text,
          k_values: Array.from({ length: 501 }, (_, idx) => idx),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "Metric computation failed.");
      }
      setResult(payload);
    } catch (err) {
      setError(err.message || "Metric computation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3.2}>
      <Paper className="glass-card hero-card" sx={{ p: { xs: 2.4, md: 3.4 } }}>
        <Stack spacing={2.2}>
          <SectionTitle
            title="Metric description"
            subtitle="Paper-style rationale for biologically faithful evaluation of ab initio annotation."
          />

          <Typography color="text.secondary">
            The purpose of this benchmark is to provide a biologically rigorous evaluation of <strong>ab initio genome annotation</strong>{" "}
            from ordinary GFF predictions against curated reference annotation. Its central premise is that the quality of an annotation
            model should not be judged primarily by per-nucleotide agreement, because local label accuracy can remain deceptively high
            even when the predicted transcript or coding structure is biologically wrong. A one-base shift at an exon or CDS boundary
            can alter splice structure, disrupt coding frame, or change the translated product, yet such an error may have only a minor
            effect on basewise scores. For this reason, the metric is organized around transcript reconstruction and gene recovery rather
            than around isolated nucleotide labels. This design follows the broader argument that interval- and gene-level evaluation is
            more appropriate than token-level scoring for biologically meaningful assessment of gene annotation systems.
          </Typography>
          <Typography color="text.secondary">
            The benchmark is evaluated in two complementary branches, <strong>exon</strong> and <strong>CDS</strong>, because these reflect
            distinct biological questions. The exon branch measures recovery of transcript architecture in its broad sense, including
            protein-coding transcripts and long non-coding RNAs. It is therefore suitable for judging whether a model reconstructs the
            transcribed structure of genes, not only their coding segments. The CDS branch isolates the protein-coding core and evaluates
            how accurately a method reconstructs the coding portion of mRNA transcripts. This separation is important because many existing
            tools are optimized for coding regions and can appear competitive when only CDS structure is considered, while failing to recover
            untranslated and non-coding components of the annotation. Conversely, a model that is strong on full transcript structure may
            still differ from coding-focused systems in the strict reconstruction of CDS organization. The two-branch design therefore makes
            the leaderboard scientifically fairer and more interpretable.
          </Typography>
          <Typography color="text.secondary">
            All scores are computed as a function of a <strong>boundary tolerance parameter</strong> (k), which expresses how far a predicted
            transcript or coding interval may deviate from the reference and still be considered localized correctly. This is not merely a
            practical relaxation. In biology, transcript starts and ends are not perfectly noise-free objects, and even high-quality reference
            annotations treat inherently variable transcriptional processes as exact coordinates. Evaluating performance across a range of
            tolerances therefore provides a more realistic view of model behavior than fixing a single arbitrary threshold. It distinguishes
            models that are approximately correct from those that are precisely correct, and it makes visible whether an apparent gain in
            performance comes from genuine structural accuracy or only from lenient localization. The use of tolerance-dependent curves is
            also consistent with prior biologically motivated benchmarking of transcript boundary recovery.
          </Typography>
          <Typography color="text.secondary">
            The first primary metric family is <strong>interval-level evaluation</strong>, which measures transcript localization without yet
            requiring full internal structure to be correct. In this view, a predicted transcript is rewarded when it is matched to a reference
            transcript within the chosen tolerance (k). Precision is calculated over predicted transcripts, because every additional prediction
            is a biological claim that can be either supported or unsupported. Recall is calculated at the level of genes, because the biologically
            meaningful question is whether at least one annotated isoform of a gene has been recovered. The resulting interval-level F1 score
            therefore balances two distinct but complementary demands: avoiding spurious transcript calls and recovering real genes. In the exon
            branch, the match reflects transcript interval agreement. In the CDS branch, the rule is deliberately more conservative: a predicted
            coding interval is credited only when it recovers the true coding core without truncating it, because cutting into CDS is far more
            damaging biologically than a modest flanking overextension. This makes the CDS branch especially appropriate for judging coding integrity.
          </Typography>
          <Typography color="text.secondary">
            The second primary metric is <strong>MI, multi-isoform recovery</strong>. MI addresses a failure mode that ordinary precision, recall,
            and F1 do not detect well: a model may recover one plausible transcript per locus and still completely miss isoform diversity. From
            a biological standpoint, this is a major limitation, because alternative isoforms are often functionally distinct and are part of the
            reference truth rather than annotation noise. MI therefore counts genes for which the method recovers more than one distinct annotated
            isoform. Importantly, this score is evaluated only on genes for which the annotation genuinely supports multi-isoform structure, so
            the metric does not penalize methods for failing to invent complexity where none exists. In this way, MI complements F1: F1 measures
            general recovery, whereas MI measures whether the method captures transcript heterogeneity.
          </Typography>
          <Typography color="text.secondary">
            Interval-level agreement alone is still insufficient, because a transcript can be localized approximately correctly while its internal
            exon or coding organization is wrong. For this reason, the benchmark introduces <strong>segmentation-level evaluation</strong>, which
            asks whether matched predictions also reconstruct the biologically relevant internal structure. In the exon branch, segmentation-level
            assessment is designed to separate uncertainty in transcript extremities from true splice-structure errors. Once a prediction has been
            localized within tolerance, it is then required to reproduce the exon organization that defines the mature transcript, especially the
            splice junction structure that determines exon–intron architecture. This prevents a model from receiving full credit merely because it
            found the right locus while misplacing internal exons. In the CDS branch, segmentation-level evaluation is even stricter: the full CDS
            segmentation must be reconstructed exactly. This reflects the fact that coding boundaries are not interchangeable structural hints; they
            determine the reading frame and thus the encoded protein. A predictor that finds the right gene but shifts a coding segment has not truly
            recovered the same biological product. Segmentation-level F1 and segmentation-level MI therefore represent the most demanding and
            biologically faithful summary of annotation quality in this benchmark.
          </Typography>
          <Typography color="text.secondary">
            Alongside these primary transcript-centered measures, the benchmark also reports <strong>part-level metrics</strong> for exons or CDS
            segments themselves. These scores quantify exact precision, recall, and F1 over unique exonic parts in the exon branch and unique CDS
            parts in the CDS branch. Their role is diagnostic rather than primary. They answer a different question: does the model identify the
            correct building blocks, even if it fails to assemble them into the right complete transcript structures? This distinction matters because
            a method may detect many individual exons or CDS segments correctly while still failing to reconstruct full isoforms. By reporting part-level
            metrics separately, the benchmark helps distinguish failures of local part detection from failures of transcript assembly. This makes the
            leaderboard more informative for model development and error analysis.
          </Typography>
          <Typography color="text.secondary">
            A further strength of the metric is that it is not limited to a single global average. The same evaluation can be <strong>stratified by
            strand, chromosome, and transcript type</strong>, allowing users to inspect whether a model behaves differently on the forward versus reverse
            strand, on different genomic contexts, or on mRNA versus lncRNA transcripts. Such stratification is biologically important because different
            transcript classes and genomic settings pose different annotation challenges. In addition, the benchmark includes a <strong>transcript-resolved
            evidence layer</strong>. For every ground-truth transcript, the interface records which predictions support it, the minimal tolerance at which
            the support appears, and whether the parent gene contributes to multi-isoform recovery. This transcript-centered perspective makes the benchmark
            auditable: users can move from leaderboard scores to the exact reference transcripts that were recovered, missed, or only partially supported.
          </Typography>
        </Stack>
      </Paper>

      <Box className="top-two-column-grid">
        <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
          <Stack spacing={2.0}>
            <SectionTitle
              title="Accepted input"
              subtitle="The playground works with GFF/GFF3-style annotations and evaluates both branches across k = 0..500."
            />
            <Typography color="text.secondary">
              Provide a prediction GFF and a ground-truth GFF. The evaluator parses transcript, exon, and CDS features directly
              from these files and computes the full set of branch-specific metrics for <span className="mono">k = 0…500</span>.
              The prediction file should describe transcript models produced by the method under evaluation. The ground-truth file
              should contain the reference transcript annotation for the same genomic region.
            </Typography>
            <Typography color="text.secondary">
              The leaderboard uses <span className="mono">use_strand=True</span> together with transcript filters appropriate for each
              branch. The exon branch evaluates <span className="mono">mRNA</span> and <span className="mono">lnc_RNA</span> transcripts.
              The CDS branch evaluates <span className="mono">mRNA</span> transcripts with annotated coding sequence.
            </Typography>
          </Stack>
        </Paper>

        <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
          <Stack spacing={2.0}>
            <SectionTitle
              title="How to use this metric with Evaluate"
              subtitle="Load the metric from Hugging Face Evaluate and run either Python-like mode or GFF mode."
            />
            <CodePanel>{EVALUATE_SNIPPET}</CodePanel>
          </Stack>
        </Paper>
      </Box>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.2}>
          <SectionTitle
            icon={<CalculateIcon color="primary" />}
            title="Playground"
            subtitle="Upload a prediction GFF and a ground-truth GFF to compute both exon and CDS branches."
          />

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Grid container spacing={2}>
            <Grid item xs={12} md={5}>
              <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
                Prediction GFF
              </Typography>
              <Button
                component="label"
                variant="outlined"
                fullWidth
                startIcon={<UploadFileIcon />}
                sx={{ height: 56 }}
              >
                {predFile ? predFile.name : "Choose prediction file"}
                <input
                  ref={predInputRef}
                  hidden
                  type="file"
                  accept=".gff,.gff3,.gtf,.txt"
                  onChange={(event) => setPredFile(event.target.files?.[0] || null)}
                />
              </Button>
            </Grid>
            <Grid item xs={12} md={5}>
              <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
                Ground-truth GFF
              </Typography>
              <Button
                component="label"
                variant="outlined"
                fullWidth
                startIcon={<UploadFileIcon />}
                sx={{ height: 56 }}
              >
                {trueFile ? trueFile.name : "Choose ground-truth file"}
                <input
                  ref={trueInputRef}
                  hidden
                  type="file"
                  accept=".gff,.gff3,.gtf,.txt"
                  onChange={(event) => setTrueFile(event.target.files?.[0] || null)}
                />
              </Button>
            </Grid>
            <Grid item xs={12} md={2}>
              <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
                Active k
              </Typography>
              <TextField
                type="number"
                fullWidth
                value={selectedKInput}
                onChange={(event) => setSelectedKInput(event.target.value)}
                onBlur={() => {
                  if (selectedKInput === "") return;
                  const parsed = Number(selectedKInput);
                  if (!Number.isFinite(parsed)) {
                    setSelectedKInput("0");
                    return;
                  }
                  setSelectedKInput(`${Math.max(0, Math.min(parsed, 500))}`);
                }}
                inputProps={{ min: 0, max: 500 }}
                sx={{ "& .MuiInputBase-root": { height: 56 } }}
              />
            </Grid>
          </Grid>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button variant="contained" onClick={compute} disabled={loading} startIcon={<CalculateIcon />}>
              {loading ? "Computing…" : "Run metric"}
            </Button>
            <Button variant="outlined" onClick={reset} startIcon={<DeleteSweepIcon />}>
              Clear
            </Button>
          </Stack>

          {selectedMetrics ? (
            <Stack spacing={2.2}>
              <Alert severity="info">
                Summary cards below show the metric at k = {selectedMetrics.k}. The full computation covers the entire range
                from 0 to 500.
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} lg={6}>
                  <Paper className="nested-panel" sx={{ p: 2.0 }}>
                    <Stack spacing={1.4}>
                      <Typography variant="h6">Exon branch</Typography>
                      <Box className="summary-grid">
                        <SummaryCard label="F1 without segmentation" value={formatScore(selectedMetrics.exon?.["interval-level"]?.f1)} />
                        <SummaryCard label="MI without segmentation" value={formatScore(selectedMetrics.exon?.["interval-level"]?.mi, 0)} />
                        <SummaryCard label="F1 with segmentation" value={formatScore(selectedMetrics.exon?.["segmentation-level"]?.f1)} />
                        <SummaryCard label="MI with segmentation" value={formatScore(selectedMetrics.exon?.["segmentation-level"]?.mi, 0)} />
                        <SummaryCard label="Exact part F1" value={formatScore(selectedMetrics.exon?.["part-level"]?.f1)} />
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <Paper className="nested-panel" sx={{ p: 2.0 }}>
                    <Stack spacing={1.4}>
                      <Typography variant="h6">CDS branch</Typography>
                      <Box className="summary-grid">
                        <SummaryCard label="F1 without segmentation" value={formatScore(selectedMetrics.cds?.["interval-level"]?.f1)} />
                        <SummaryCard label="MI without segmentation" value={formatScore(selectedMetrics.cds?.["interval-level"]?.mi, 0)} />
                        <SummaryCard label="F1 with segmentation" value={formatScore(selectedMetrics.cds?.["segmentation-level"]?.f1)} />
                        <SummaryCard label="MI with segmentation" value={formatScore(selectedMetrics.cds?.["segmentation-level"]?.mi, 0)} />
                        <SummaryCard label="Exact part F1" value={formatScore(selectedMetrics.cds?.["part-level"]?.f1)} />
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
              <Paper className="nested-panel" sx={{ p: 2.0 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Compact JSON preview
                </Typography>
                <CodePanel>{JSON.stringify(selectedMetrics, null, 2)}</CodePanel>
              </Paper>
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
