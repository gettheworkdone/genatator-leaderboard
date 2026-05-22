import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  IconButton,
  Button,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from "@mui/material";

import CalculateIcon from "@mui/icons-material/Calculate";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
const EVALUATE_SNIPPET = `# How to use this metric with Hugging Face Evaluate
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
    print(annotated_transcripts[first_annotated_tx_id].get("annotated_transcripts", []))`;

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

function PythonSnippet({ code }) {
  const KEYWORDS = new Set([
    "import",
    "from",
    "as",
    "True",
    "False",
    "None",
    "for",
    "in",
    "if",
    "else",
    "print",
  ]);
  return (
    <>
      {code.split("\n").map((line, lineIdx) => (
        <React.Fragment key={`line-${lineIdx}`}>
          {line.split(/(\s+|"[^"]*"|'[^']*'|#.*$|\b[A-Za-z_][A-Za-z0-9_]*\b|\d+)/g).map((token, tokenIdx) => {
            if (!token) {
              return null;
            }
            let className = "";
            if (token.startsWith("#")) className = "py-comment";
            else if (/^"[^"]*"|'[^']*'$/.test(token)) className = "py-string";
            else if (/^\d+$/.test(token)) className = "py-number";
            else if (KEYWORDS.has(token)) className = "py-keyword";
            return (
              <span className={className} key={`line-${lineIdx}-token-${tokenIdx}`}>
                {token}
              </span>
            );
          })}
          {lineIdx < code.split("\n").length - 1 ? "\n" : null}
        </React.Fragment>
      ))}
    </>
  );
}

function CodePanel({ children }) {
  const [copied, setCopied] = useState(false);
  const code = typeof children === "string" ? children : String(children ?? "");
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <Box className="code-panel-wrapper">
      <Tooltip title={copied ? "Copied" : "Copy code"}>
        <IconButton size="small" className="code-copy-btn" onClick={handleCopy} aria-label="Copy code snippet">
          <ContentCopyIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
      <Box component="pre" className="code-panel mono code-panel--python">
        <code>
          <PythonSnippet code={code} />
        </code>
      </Box>
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
          <SectionTitle title="Metrics description" />

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
            <SectionTitle title="Accepted input" />
            <Typography color="text.secondary">
              You should provide two files: a prediction GFF and a ground-truth GFF. The prediction file should contain
              transcript models produced by the method being assessed. The ground-truth file should contain the reference
              transcript annotation for the same genomic region.
            </Typography>
            <Typography color="text.secondary">
              <span className="mono">pred_gff</span> is the path to the prediction GFF/GFF3 file. The evaluator reads predicted
              transcript, exon, and CDS features from this file.
            </Typography>
            <Typography color="text.secondary">
              <span className="mono">true_gff</span> is the path to the ground-truth GFF/GFF3 file. The evaluator reads
              reference transcript, exon, and CDS features from this file.
            </Typography>
            <Typography color="text.secondary">
              <span className="mono">k_values</span> is the list of boundary tolerances, measured in base pairs. Each{" "}
              <span className="mono">k</span> value defines how far a predicted boundary may deviate from the reference boundary
              and still be counted as matched. For example, <span className="mono">k_values=[0, 50, 100, 250, 500]</span>{" "}
              evaluates the metric at five tolerances.
            </Typography>
            <Typography color="text.secondary">
              <span className="mono">use_strand</span> controls whether strand information is used during matching. If{" "}
              <span className="mono">use_strand=True</span>, a prediction must match the reference on the same chromosome,
              coordinates, and strand. If <span className="mono">use_strand=False</span>, strand is ignored. This is useful for
              models that do not report strand information in their predictions.
            </Typography>
            <Typography color="text.secondary">
              <span className="mono">gene_biotypes</span> is an optional filter for reference gene biotypes. For example,{" "}
              <span className="mono">gene_biotypes=[&quot;protein_coding&quot;, &quot;lncRNA&quot;]</span> restricts the evaluation to those gene categories
              when the corresponding annotations are present in the ground-truth file.
            </Typography>
            <Typography color="text.secondary">
              <span className="mono">transcript_types</span> is an optional filter for reference transcript types. For example,{" "}
              <span className="mono">transcript_types=[&quot;mRNA&quot;, &quot;lnc_RNA&quot;]</span> evaluates only those transcript classes.
            </Typography>
            <Typography color="text.secondary">
              The output contains exon-branch metrics, CDS-branch metrics, stratified metrics, and detailed transcript-level
              matching information. The stratifier reports the same metrics grouped by strand, chromosome, and transcript type.
              The detailed output shows, for each ground-truth transcript, which predictions matched it and the minimum{" "}
              <span className="mono">k</span> value required for the match.
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
          <SectionTitle
            title="Playground"
            subtitle="Upload your model’s prediction GFF together with the matching ground-truth GFF, and the playground will calculate the metric scores for you."
          />

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
