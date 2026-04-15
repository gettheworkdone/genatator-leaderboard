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
            The purpose of this benchmark is to provide a biologically rigorous evaluation of <span className="mono">ab initio genome
            annotation</span> from ordinary GFF predictions against curated reference annotation. Its central premise is that quality
            should not be judged primarily by per-nucleotide agreement, because local label accuracy can remain deceptively high
            even when predicted transcript or coding structure is biologically wrong.
          </Typography>
          <Typography color="text.secondary">
            The benchmark is evaluated in two complementary branches, <span className="mono">exon</span> and <span className="mono">CDS</span>.
            The exon branch measures recovery of transcript architecture across coding and long non-coding transcripts, while the
            CDS branch isolates the protein-coding core and evaluates coding reconstruction fidelity.
          </Typography>
          <Typography color="text.secondary">
            All scores are computed across a boundary tolerance parameter <span className="mono">k</span>. Interval-level metrics evaluate
            localization; segmentation-level metrics evaluate strict internal structure; MI captures multi-isoform recovery; and
            part-level metrics provide diagnostic precision/recall/F1 over unique exon or CDS parts.
          </Typography>
          <Typography color="text.secondary">
            The same framework can be stratified by strand, chromosome, and transcript type, and audited through transcript-resolved
            evidence to see exactly which reference transcripts were recovered, missed, or only weakly supported.
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
