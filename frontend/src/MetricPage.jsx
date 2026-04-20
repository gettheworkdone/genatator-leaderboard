import React, { useEffect, useMemo, useRef, useState } from "react";
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
const EVALUATE_SNIPPET = `# How to use this metric with Evaluate
# This metric supports a Python API through Hugging Face Evaluate.
#
# 1) Install dependencies: pip install evaluate
# 2) Load the metric from Hugging Face repo shmelev/genatator-leaderboard.
# 3) Pass local file paths as plain strings and compute everything in one call.
#
import evaluate

metric = evaluate.load("shmelev/genatator-leaderboard")

pred_gff_path = "/tmp/predictions.gff"
true_gff_path = "/tmp/reference.gff"

# Compute both branches through Evaluate.
result = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=list(range(0, 501)),
)

print(result["exon"][250]["interval-level"]["f1"])
print(result["cds"][250]["segmentation-level"]["f1"])

# Use stratifier output returned by Evaluate.
print(result["stratifier"]["exon"]["transcript_type"]["mRNA"][250])

# Use detailed transcript output returned by Evaluate.
print(len(result["detailed"]["exon"]), list(result["detailed"]["exon"].keys())[:3])`;

const METRIC_DESCRIPTION_HTML = String.raw`
<section id="metric-description">
  <p>
    This metric is built for the situation in which a prediction may look locally accurate and still be biologically wrong.
    In genome annotation, a small shift at a transcript, exon, or coding boundary can preserve much of the basewise signal
    while changing splice structure, coding frame, or the translated product. For that reason, the metric does not start from
    per-nucleotide agreement. Instead, it treats reconstructed transcript objects and their structural parts as the primary
    units of evaluation.
  </p>

  <p>
    The metric is reported in two branches. The <strong>exon branch</strong> asks whether the predicted annotation recovers
    transcript architecture at the exon level, including both protein-coding and long non-coding transcripts. The
    <strong>CDS branch</strong> asks whether the predicted annotation recovers the coding structure of mRNA transcripts.
    This distinction matters biologically: the exon branch rewards recovery of the full transcribed structure, whereas the
    CDS branch focuses on the part of the transcript that determines the encoded protein.
  </p>

  <p>
    Let \(k \ge 0\) be a boundary tolerance measured in base pairs. At a given value of \(k\), the metric first computes an
    <strong>interval-level</strong> score. In the exon branch, a predicted transcript interval is counted as matched when its
    boundaries fall within tolerance \(k\) relative to at least one reference transcript interval. In the CDS branch, the same
    idea is applied to the coding span of the transcript, so the score reflects recovery of coding extent rather than full
    transcript extent. Let \(TP_{\mathrm{int}}(k)\) be the number of matched predicted transcripts, let
    \(FP_{\mathrm{int}}(k)\) be the number of predicted transcripts that are not matched, let \(TP_{\mathrm{gene}}(k)\) be the
    number of reference genes for which at least one transcript is matched, and let \(FN_{\mathrm{gene}}(k)\) be the number
    of reference genes with no matched transcript. Then
  </p>

  <div class="equation">
    \[
      \mathrm{Precision}(k)=
      \frac{TP_{\mathrm{int}}(k)}
      {TP_{\mathrm{int}}(k)+FP_{\mathrm{int}}(k)},
      \qquad
      \mathrm{Recall}(k)=
      \frac{TP_{\mathrm{gene}}(k)}
      {TP_{\mathrm{gene}}(k)+FN_{\mathrm{gene}}(k)},
    \]
    \[
      F_{1}(k)=
      \frac{2\,\mathrm{Precision}(k)\,\mathrm{Recall}(k)}
      {\mathrm{Precision}(k)+\mathrm{Recall}(k)}.
    \]
  </div>

  <p>
    This definition is deliberate. Precision is computed over predicted transcripts because each prediction is a biological
    claim that may be correct or spurious. Recall is computed over reference genes because the biologically relevant question
    is whether a gene has been recovered at all, not whether every reference transcript has been counted independently.
    The score therefore balances overprediction against failure to recover annotated genes.
  </p>

  <p>
    The second view is <strong>segmentation-aware evaluation</strong>. Here, interval matching alone is not enough: the
    prediction must also reconstruct the relevant internal structure. In the exon branch, this means that the exon chain must
    agree after allowing the chosen tolerance only at the outer transcript boundaries; internal splice structure must still be
    correct. In the CDS branch, the ordered CDS chain must match exactly. This distinction is biologically necessary because
    approximate localization and correct structural reconstruction are not the same thing. A model may find the right locus
    and still recover the wrong mature transcript or the wrong coding organization.
  </p>

  <p>
    The metric also reports <strong>multi-isoform recovery</strong> (MI). This quantity is evaluated only for genes that are
    genuinely multi-isoform in the reference annotation. A gene contributes to MI only when the prediction recovers at least
    two distinct transcript objects that match at least two distinct annotated isoforms of that same gene. Accordingly,
    MI without segmentation measures isoform multiplicity after interval matching, whereas MI with segmentation measures
    isoform multiplicity only after the structural filter described above has also been passed.
  </p>

  <p>
    Finally, the metric reports <strong>exact part-level</strong> scores. For a chosen branch \(B\), let
    \(S_{\mathrm{pred}}^{B}\) be the set of all unique predicted intervals of that branch pooled across transcripts, and let
    \(S_{\mathrm{true}}^{B}\) be the corresponding set of unique reference intervals. In the exon branch these are exon intervals;
    in the CDS branch these are CDS intervals. A <em>true positive</em> is a predicted interval in \(S_{\mathrm{pred}}^{B}\)
    that exactly matches an interval in \(S_{\mathrm{true}}^{B}\). A <em>false positive</em> is a predicted interval with no
    exact reference match. A <em>false negative</em> is a reference interval that is not recovered by any predicted interval.
    If \(TP_{\mathrm{part}}^{B}\), \(FP_{\mathrm{part}}^{B}\), and \(FN_{\mathrm{part}}^{B}\) denote these counts, then
  </p>

  <div class="equation">
    \[
      \mathrm{Precision}_{\mathrm{part}}^{B}=
      \frac{TP_{\mathrm{part}}^{B}}
      {TP_{\mathrm{part}}^{B}+FP_{\mathrm{part}}^{B}},
      \qquad
      \mathrm{Recall}_{\mathrm{part}}^{B}=
      \frac{TP_{\mathrm{part}}^{B}}
      {TP_{\mathrm{part}}^{B}+FN_{\mathrm{part}}^{B}},
    \]
    \[
      F_{1,\mathrm{part}}^{B}=
      \frac{2\,\mathrm{Precision}_{\mathrm{part}}^{B}\,\mathrm{Recall}_{\mathrm{part}}^{B}}
      {\mathrm{Precision}_{\mathrm{part}}^{B}+\mathrm{Recall}_{\mathrm{part}}^{B}}.
    \]
  </div>

  <p>
    These part-level scores are not a replacement for transcript-level evaluation. Rather, they answer a narrower question:
    did the model identify the correct exon or CDS pieces, even if it failed to assemble them into the correct full transcript?
    Taken together, interval-level F1, segmentation-aware F1, multi-isoform recovery, and exact part-level scores provide a
    mathematically explicit and biologically coherent picture of annotation quality.
  </p>
</section>`;

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
  const [metricExpanded, setMetricExpanded] = useState(false);
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

  useEffect(() => {
    if (window?.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [metricExpanded, result]);

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
          <SectionTitle title="Metric description" subtitle="Paper-style rationale for biologically faithful evaluation of ab initio annotation." />

          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                maxHeight: metricExpanded ? "none" : 372,
                overflow: "hidden",
                pr: 0.5,
              }}
            >
              <Box className="metric-description" dangerouslySetInnerHTML={{ __html: METRIC_DESCRIPTION_HTML }} />
            </Box>
            {!metricExpanded ? (
              <Box
                sx={{
                  position: "absolute",
                  bottom: 38,
                  left: 0,
                  right: 0,
                  height: 108,
                  background:
                    "linear-gradient(to bottom, rgba(248,251,250,0) 0%, rgba(248,251,250,0.34) 38%, rgba(248,251,250,0.76) 68%, rgba(248,251,250,0.98) 100%)",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <Button variant="text" onClick={() => setMetricExpanded((value) => !value)} sx={{ alignSelf: "flex-start", mt: 0.8 }}>
              {metricExpanded ? "Show less" : "Show more"}
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 2fr)" },
          gap: 2,
          width: "100%",
        }}
      >
        <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 }, height: "100%" }}>
          <Stack spacing={2.0}>
            <SectionTitle
              title="Accepted input"
              subtitle="The playground accepts GFF or GFF3-style annotation files and evaluates both branches over a user-selected range of k values."
            />
            <Typography color="text.secondary">
              You should provide two files: a prediction GFF and a ground-truth GFF. The evaluator reads transcript, exon, and
              CDS features directly from these annotations and computes the complete set of branch-specific metrics for the chosen
              k values. The prediction file should contain the transcript models produced by the method being assessed. The
              ground-truth file should contain the reference transcript annotation for the same genomic region.
            </Typography>
            <Typography color="text.secondary">
              In the leaderboard, evaluation is performed with <span className="mono">use_strand=True</span> and with transcript
              filters chosen separately for each branch. The exon branch includes <span className="mono">mRNA</span> and{" "}
              <span className="mono">lnc_RNA</span> transcripts, whereas the CDS branch includes <span className="mono">mRNA</span>{" "}
              transcripts that have annotated coding sequence.
            </Typography>
          </Stack>
        </Paper>
        <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 }, height: "100%" }}>
          <Stack spacing={2.0}>
            <SectionTitle
              title="How to use this metric with Evaluate"
              subtitle="Python examples for metric compute, stratifier, and detailed information."
            />
            <CodePanel>{EVALUATE_SNIPPET}</CodePanel>
          </Stack>
        </Paper>
      </Box>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.2}>
          <SectionTitle title="Playground" subtitle="Upload a prediction GFF and a ground-truth GFF to compute both exon and CDS branches." />

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 5fr) minmax(0, 5fr) minmax(0, 2fr)" },
              gap: 2,
              width: "100%",
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
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
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
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
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
                Active k
              </Typography>
              <TextField
                type="number"
                size="small"
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
            </Box>
          </Box>

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
              <Alert severity="info">Summary cards below show the metric at k = {selectedMetrics.k}.</Alert>
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
