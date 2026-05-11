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
#   gene_biotypes: optional filter for gene biotypes.
#   transcript_types: optional filter for transcript types.
#
# By default, the leaderboard uses:
#   use_strand=True
#   exon branch: mRNA and lnc_RNA transcripts from protein_coding and lncRNA genes
#   CDS branch: mRNA transcripts from protein_coding genes
#
# The result contains:
#   result["exon"]       -> exon-branch metrics by k
#   result["cds"]        -> CDS-branch metrics by k
#   result["stratifier"] -> grouped metrics by strand, chromosome, and transcript type
#   result["detailed"]   -> transcript-level matching information

import evaluate

metric = evaluate.load("shmelev/genatator-leaderboard")

pred_gff_path = "/tmp/predictions.gff"
true_gff_path = "/tmp/reference.gff"


# ---------------------------------------------------------------------
# 1) Leaderboard-style evaluation
# ---------------------------------------------------------------------
# This is the standard setting used for the leaderboard.
# It evaluates both exon and CDS branches and returns all outputs.

result = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=list(range(0, 501)),
    use_strand=True,
)

# Main exon-branch scores at k = 250
print(result["exon"][250]["interval-level"]["f1"])
print(result["exon"][250]["segmentation-level"]["f1"])
print(result["exon"][250]["interval-level"]["mi"])
print(result["exon"][250]["segmentation-level"]["mi"])

# Main CDS-branch scores at k = 250
print(result["cds"][250]["interval-level"]["f1"])
print(result["cds"][250]["segmentation-level"]["f1"])
print(result["cds"][250]["interval-level"]["mi"])
print(result["cds"][250]["segmentation-level"]["mi"])

# Exact part-level scores
print(result["exon"][250]["part-level"]["f1"])
print(result["cds"][250]["part-level"]["f1"])


# ---------------------------------------------------------------------
# 2) Evaluation without strand matching
# ---------------------------------------------------------------------
# Use this for models that do not provide strand information,
# for example SegmentNT-like or NTv3-like outputs.

result_no_strand = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=[0, 50, 100, 250, 500],
    use_strand=False,
)

print(result_no_strand["exon"][250]["interval-level"]["f1"])


# ---------------------------------------------------------------------
# 3) Custom filtering
# ---------------------------------------------------------------------
# You can restrict evaluation to selected gene biotypes and transcript types.
# For example, this focuses on mRNA transcripts from protein-coding genes.

result_mrna_only = metric.compute(
    pred_gff=pred_gff_path,
    true_gff=true_gff_path,
    k_values=[250],
    use_strand=True,
    gene_biotypes=["protein_coding"],
    transcript_types=["mRNA"],
)

print(result_mrna_only["exon"][250]["segmentation-level"]["f1"])
print(result_mrna_only["cds"][250]["segmentation-level"]["f1"])


# ---------------------------------------------------------------------
# 4) Stratifier output
# ---------------------------------------------------------------------
# Stratifier returns the same metrics, but grouped by biological rules:
#   strand
#   chromosome
#   transcript_type

print(result["stratifier"]["exon"]["transcript_type"]["mRNA"][250])
print(result["stratifier"]["exon"]["strand"]["+"][250])
print(result["stratifier"]["cds"]["chromosome"]["NC_060944.1"][250])


# ---------------------------------------------------------------------
# 5) Detailed transcript-level output
# ---------------------------------------------------------------------
# Detailed output lets you inspect which predictions matched
# each ground-truth transcript and at which minimal k.

detailed_exon = result["detailed"]["exon"]

print(len(detailed_exon))
print(list(detailed_exon.keys())[:3])

first_tx_id = list(detailed_exon.keys())[0]
print(detailed_exon[first_tx_id])

# Example fields:
#   chromosome
#   start
#   end
#   strand
#   gene_id
#   transcript_type
#   interval-level["predictions"]
#   segmentation-level["predictions"]`

const METRIC_DESCRIPTION_HTML = String.raw`
<section id="metric-description">
  <p>
    This metric is designed for genome annotation cases where a prediction can look locally accurate while still being
    biologically wrong. A small shift at a transcript, exon, or coding boundary may preserve much of the basewise signal,
    but it can still change splice structure, disrupt the coding frame, or alter the translated product. For that reason,
    the metric does not rely on per-nucleotide comparison. Instead, it was designed to account for the main biological
    constraints of gene annotation. Splice-site boundaries are assessed strictly, while the tolerance parameter \(k\) is
    introduced to reflect the fact that transcription start and end positions can vary in real cells.
  </p>

  <p>
    The metric has two branches. The <strong>exon branch</strong> evaluates transcript structure for mRNA and lncRNA genes.
    For mRNA transcripts, this includes both UTR exons and coding exons. The <strong>CDS branch</strong> evaluates the
    coding sequence structure of mRNA transcripts. In simple terms, the exon branch asks whether the model recovers the
    transcribed exon structure, while the CDS branch asks whether it recovers the protein-coding structure.
  </p>

  <p>
    Let \(k \ge 0\) be the allowed boundary deviation measured in base pairs. In this context, transcript start means the
    first transcribed nucleotide, and transcript end means the last transcribed nucleotide. These positions are not always
    sharply defined in biology, because transcription initiation and termination can vary across molecules. This is different
    from splice sites, which correspond to much more precise exon-intron boundaries. Therefore, the metric is evaluated at
    a user-specified value of \(k\), where smaller values require stricter boundary agreement and larger values allow more
    tolerant matching.
  </p>

  <p>
    At a given value of \(k\), the metric first computes an <strong>interval-level</strong> score. In the exon branch,
    this is similar to comparing BED-like intervals that contain only transcript starts and ends. It asks whether a predicted
    transcript interval falls close enough to a reference transcript interval, without checking the internal exon structure.
    In the CDS branch, the same idea is applied to the coding span of an mRNA transcript. A predicted interval is considered
    matched only if its relevant boundaries satisfy the chosen tolerance. Therefore, even if a prediction covers almost the
    entire reference transcript, it is still counted as unmatched if one of its relevant boundaries lies outside the specified
    \(k\) by even one additional nucleotide.
  </p>

  <p>
    Let \(TP_{\mathrm{int}}(k)\) be the number of matched predicted <strong>transcripts</strong>. Let
    \(FP_{\mathrm{int}}(k)\) be the number of predicted <strong>transcripts</strong> that are not matched. Let
    \(TP_{\mathrm{gene}}(k)\) be the number of reference <strong>genes</strong> for which at least one transcript is matched.
    Let \(FN_{\mathrm{gene}}(k)\) be the number of reference <strong>genes</strong> for which no transcript is matched.
    Then
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
    Precision and recall are intentionally defined over different biological entities. Precision is calculated over predicted
    <strong>transcripts</strong>, because false positives are naturally defined as predicted transcript objects that fail to
    match the reference at the chosen \(k\). Recall, however, is calculated over reference <strong>genes</strong>, not over
    reference transcripts. This is necessary because multiple annotated isoforms of the same gene can have identical transcript
    start and end coordinates. At the interval level, where internal segmentation is not considered, such isoforms cannot be
    distinguished by their outer interval alone. Therefore, a transcript-level false negative would be ambiguous. The metric
    could not determine which isoform with the same outer coordinates was missed. Gene-level recall avoids this ambiguity.
    A reference gene is counted as recovered when at least one of its transcripts is matched.
  </p>

  <p>
    This convention also gives a consistent interpretation to models that predict several alternative transcripts with the
    same start and end positions. At the interval level, those predictions are indistinguishable by boundaries alone. Since
    \(TP_{\mathrm{int}}(k)\) is counted over predicted transcript objects, each predicted transcript whose interval matches
    the reference can contribute to the number of matched predictions. The interval-level score therefore evaluates whether
    predicted transcript intervals are supported, but it does not claim to resolve alternative splicing when isoforms share
    the same outer coordinates.
  </p>

  <p>
    The next step is <strong>segmentation-aware evaluation</strong>. Interval matching alone is not enough, because a model
    may find the right genomic region while still predicting the wrong exon chain or CDS. In the exon branch, the
    prediction must reconstruct the exon structure after allowing tolerance only at the outer transcript boundaries. Internal
    splice-site boundaries must still be correct. In the CDS branch, the CDS must match exactly, because coding boundary
    errors can change the encoded protein. This segmentation-aware step makes it possible to distinguish isoforms with the
    same transcript start and end positions when they differ in internal exon or CDS structure. Importantly, the calculation
    principle remains the same: precision is still calculated over predicted transcripts, recall is still calculated over
    reference genes, and the same F1 formula is applied after the structural filter has been added.
  </p>

  <p>
    The metric also reports <strong>multi-isoform recovery</strong> (MI). MI is calculated only for genes that really have
    multiple distinct isoforms in the reference annotation. A gene contributes to MI only if the prediction recovers at least
    two distinct transcript objects that match at least two distinct annotated isoforms of that gene. Therefore, MI without
    segmentation measures whether multiple isoforms are recovered after interval matching, while MI with segmentation
    measures whether multiple isoforms are recovered after the structural check as well.
  </p>

  <p>
    Finally, the metric reports <strong>exact part-level</strong> scores. For a chosen branch \(B\), let
    \(S_{\mathrm{pred}}^{B}\) be the set of all unique predicted intervals of that branch pooled across transcripts, and let
    \(S_{\mathrm{true}}^{B}\) be the corresponding set of unique reference intervals. In the exon branch, these sets contain
    exon intervals. In the CDS branch, these sets contain CDS intervals. A <em>true positive</em> is a predicted interval in
    \(S_{\mathrm{pred}}^{B}\) that exactly matches an interval in \(S_{\mathrm{true}}^{B}\). A <em>false positive</em> is a
    predicted interval with no exact reference match. A <em>false negative</em> is a reference interval that is not recovered
    by any predicted interval. If \(TP_{\mathrm{part}}^{B}\), \(FP_{\mathrm{part}}^{B}\), and \(FN_{\mathrm{part}}^{B}\)
    denote these counts, then
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
    These part-level scores answer a narrower question than transcript-level evaluation. They show whether the model found
    the correct exon or CDS pieces, even if it failed to assemble those pieces into the correct full transcript. Together,
    interval-level F1, segmentation-aware F1, MI, and exact part-level scores give a rigorous but readable picture of
    annotation quality.
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
          <SectionTitle title="Metric description" />

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
