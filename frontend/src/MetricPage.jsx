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
import ScienceIcon from "@mui/icons-material/Science";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import CodeIcon from "@mui/icons-material/Code";

const PLAYGROUND_SNIPPET = `curl -X POST /api/playground/compute \\
  -H "Content-Type: application/json" \\
  -d '{
    "pred_gff_text": "<prediction gff contents>",
    "true_gff_text": "<ground truth gff contents>",
    "k_values": [0, 1, 2, ..., 500]
  }'`;

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
  const [selectedK, setSelectedK] = useState(250);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const predInputRef = useRef(null);
  const trueInputRef = useRef(null);

  const selectedMetrics = useMemo(() => {
    if (!result) {
      return null;
    }
    const k = Math.max(0, Math.min(Number(selectedK) || 0, 500));
    return {
      exon: result.exon?.[k],
      cds: result.cds?.[k],
      k,
    };
  }, [result, selectedK]);

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
            icon={<ScienceIcon color="primary" />}
            title="Gene-level metric description"
            subtitle="A rigorous metric for biologically meaningful evaluation of exon and CDS reconstruction from GFF annotations."
          />

          <Typography color="text.secondary">
            This Space evaluates ab initio genome annotation models under the principle that biologically useful predictions must
            recover coherent transcript structures rather than merely achieve strong average per-nucleotide agreement. Token-level
            metrics can hide small boundary shifts that have negligible effect on aggregate scores yet alter exon composition,
            disrupt codon phase, or invalidate the coding sequence of an mRNA. The metric implemented here therefore operates on
            annotation intervals reconstructed from GFF files and scores exact agreement at the level of biologically interpretable
            structures.
          </Typography>
          <Typography color="text.secondary">
            Two complementary branches are reported. The <span className="mono">exon</span> branch evaluates transcript exon structure,
            including both protein-coding and long non-coding RNAs. The <span className="mono">CDS</span> branch focuses on coding
            sequence reconstruction for protein-coding transcripts only. For each branch, the metric reports interval-level
            precision, recall, and F1 as well as a multi-isoform score (MI). It then applies an additional segmentation filter,
            yielding a stricter second set of scores that require exact agreement of the exon or CDS parts themselves.
          </Typography>
          <Typography color="text.secondary">
            This design follows the biological observation that a transcript boundary or splice-junction displacement by even one
            nucleotide can change the downstream interpretation of the sequence, especially in coding regions. By emphasizing exact
            interval agreement and exact segmentation, the metric provides a substantially more faithful assessment of annotation
            quality than coarse token-level summaries.
          </Typography>
        </Stack>
      </Paper>

      <Box className="top-two-column-grid">
        <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
          <Stack spacing={2.0}>
            <SectionTitle
              icon={<UploadFileIcon color="primary" />}
              title="Accepted input"
              subtitle="The playground works only with GFF/GFF3-style annotations. No Python array mode is used in this Space."
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
              icon={<CodeIcon color="primary" />}
              title="Playground REST call"
              subtitle="The same backend API used by the interface can be called programmatically."
            />
            <CodePanel>{PLAYGROUND_SNIPPET}</CodePanel>
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
              <Button component="label" variant="outlined" fullWidth startIcon={<UploadFileIcon />}>
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
              <Button component="label" variant="outlined" fullWidth startIcon={<UploadFileIcon />}>
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
                k for summary
              </Typography>
              <TextField
                type="number"
                fullWidth
                value={selectedK}
                onChange={(event) => setSelectedK(event.target.value)}
                inputProps={{ min: 0, max: 500 }}
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
