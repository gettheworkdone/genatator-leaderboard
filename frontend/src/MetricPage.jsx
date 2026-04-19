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

const METRIC_DESCRIPTION_HTML = `
<section id="metric-description">
  <p>This metric evaluates <em>ab initio</em> genome annotation at the level of biologically meaningful objects rather than isolated nucleotides. The motivation is straightforward: small boundary errors may have only a minor effect on basewise agreement, yet they can alter splice structure, disrupt the coding frame, or change the resulting protein. Therefore, correctness is defined through transcript and gene reconstruction. In this setting, interval-level agreement is summarized by</p>
  <div class="equation">\\[F^{K}_{\\mathrm{interval}}=\\frac{2TP}{2TP+FP+FN}.\\]</div>
  <p>The metric is computed in two branches. The <strong>exon</strong> branch measures recovery of transcript architecture across protein-coding and long non-coding genes, whereas the <strong>CDS</strong> branch measures recovery of the protein-coding core of mRNA transcripts. Thus, the exon branch reflects transcript structure in the broad sense, while the CDS branch isolates coding fidelity.</p>
  <p>All primary scores depend on a boundary tolerance parameter \\(k\\), which specifies how far a prediction may deviate from the reference and still be considered correctly localized. At tolerance \\(k\\), interval-level precision, recall, and F1 are defined as</p>
  <div class="equation">\\[\\mathrm{Precision}(k)=\\frac{M_{\\mathrm{pred}}(k)}{N_{\\mathrm{pred}}},\\qquad\\mathrm{Recall}(k)=\\frac{M_{\\mathrm{gene}}(k)}{N_{\\mathrm{gene}}},\\qquad F_{1}(k)=\\frac{2\\,\\mathrm{Precision}(k)\\,\\mathrm{Recall}(k)}{\\mathrm{Precision}(k)+\\mathrm{Recall}(k)}.\\]</div>
  <p>Here, \\(M_{\\mathrm{pred}}(k)\\) is the number of predicted transcripts matched at tolerance \\(k\\), \\(N_{\\mathrm{pred}}\\) is the total number of predicted transcripts, \\(M_{\\mathrm{gene}}(k)\\) is the number of reference genes for which at least one transcript is recovered, and \\(N_{\\mathrm{gene}}\\) is the total number of reference genes under evaluation. Consequently, precision measures how many transcript claims made by the model are supported, whereas recall measures how much of the annotated gene set is recovered.</p>
  <p>Since approximate localization is not equivalent to correct structure, the metric also includes a <strong>segmentation-level</strong> evaluation. First, interval-matched prediction–reference pairs are identified. Then only those pairs whose internal structure is biologically valid are retained:</p>
  <div class="equation">\\[\\mathcal{S}_{\\mathrm{seg}}(k)=\\left\\{(p,t)\\in\\mathcal{S}_{\\mathrm{int}}(k)\\;:\\;\\sigma(p)=\\sigma(t)\\right\\},\\]</div>
  <p>where \\(\\mathcal{S}_{\\mathrm{int}}(k)\\) is the set of interval-matched pairs and \\(\\sigma\\) denotes the structural signature of the transcript. In the exon branch, this tests whether exon organization is reconstructed after allowing tolerance only at transcript extremities. In the CDS branch, it requires exact reconstruction of the CDS chain, because coding-boundary errors directly affect the encoded product. The same precision, recall, and F1 formulas are then applied to \\(\\mathcal{S}_{\\mathrm{seg}}(k)\\).</p>
  <p>To measure recovery of transcript diversity, the metric further reports <strong>multi-isoform recovery</strong> (MI). This score is evaluated only on genes that truly admit more than one distinct annotated isoform and asks whether the prediction also recovers at least two distinct objects for such a gene:</p>
  <div class="equation">\\[\\mathrm{MI}(k)=\\sum_{g\\in\\mathcal{G}_{\\mathrm{allow}}}\\mathbf{1}\\!\\left(\\left|\\Pi_{g}(k)\\right|\\ge 2\\;\\land\\;\\left|T_{g}(k)\\right|\\ge 2\\right),\\]</div>
  <p>where \\(\\mathcal{G}_{\\mathrm{allow}}\\) is the set of genes with at least two distinct annotated isoforms, \\(\\Pi_{g}(k)\\) is the set of distinct matched predicted objects for gene \\(g\\), and \\(T_{g}(k)\\) is the set of distinct matched reference transcript objects. Hence, MI complements F1: F1 measures overall recovery, whereas MI measures whether isoform multiplicity itself is reconstructed.</p>
  <p>Finally, the metric reports exact <strong>part-level</strong> scores over unique exons in the exon branch and unique CDS segments in the CDS branch:</p>
  <div class="equation">\\[\\mathrm{Precision}_{\\mathrm{part}}=\\frac{M^{\\mathrm{pred}}_{\\mathrm{part}}}{N^{\\mathrm{pred}}_{\\mathrm{part}}},\\qquad\\mathrm{Recall}_{\\mathrm{part}}=\\frac{M^{\\mathrm{true}}_{\\mathrm{part}}}{N^{\\mathrm{true}}_{\\mathrm{part}}},\\qquad F_{1,\\mathrm{part}}=\\frac{2\\,\\mathrm{Precision}_{\\mathrm{part}}\\,\\mathrm{Recall}_{\\mathrm{part}}}{\\mathrm{Precision}_{\\mathrm{part}}+\\mathrm{Recall}_{\\mathrm{part}}}.\\]</div>
  <p>These part-level quantities are diagnostic rather than primary. They show whether the model detects the correct structural elements even when it fails to assemble them into the correct complete transcript. Accordingly, the metric combines interval-level recovery, segmentation-level correctness, multi-isoform recovery, and exact part detection into a single biologically coherent evaluation framework.</p>
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
                maxHeight: metricExpanded ? "none" : 360,
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
                  bottom: 44,
                  left: 0,
                  right: 0,
                  height: 64,
                  background: "linear-gradient(to bottom, rgba(248,251,250,0), rgba(248,251,250,1))",
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
