import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchIcon from "@mui/icons-material/Search";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = [
  "#0f766e",
  "#0ea5e9",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#7c3aed",
  "#0891b2",
  "#1d4ed8",
  "#ea580c",
];

const CHART_AXIS_TICKS = Object.freeze([0, 150, 250, 350, 500]);

const METRIC_LABELS = {
  interval_f1: "F1 without segmentation",
  interval_precision: "Precision without segmentation",
  interval_recall: "Recall without segmentation",
  interval_mi: "MI without segmentation",
  segmentation_f1: "F1 with segmentation",
  segmentation_precision: "Precision with segmentation",
  segmentation_recall: "Recall with segmentation",
  segmentation_mi: "MI with segmentation",
};

const SORT_METRICS = [
  { value: "exon_interval_f1", label: "Rank by exon F1 without segmentation" },
  { value: "exon_interval_mi", label: "Rank by exon MI without segmentation" },
  { value: "exon_segmentation_f1", label: "Rank by exon F1 with segmentation" },
  { value: "exon_segmentation_mi", label: "Rank by exon MI with segmentation" },
  { value: "cds_interval_f1", label: "Rank by CDS F1 without segmentation" },
  { value: "cds_interval_mi", label: "Rank by CDS MI without segmentation" },
  { value: "cds_segmentation_f1", label: "Rank by CDS F1 with segmentation" },
  { value: "cds_segmentation_mi", label: "Rank by CDS MI with segmentation" },
];

const LEADERBOARD_DESCRIPTION_HTML = `
  <p>
    The leaderboard is meant to help you read the metric in stages, from a quick overview to transcript-level evidence.
    The first panel, <strong>Temporary submission</strong>, lets you upload a prediction GFF and give it a model name for
    the current browser session. The uploaded file is evaluated on demand under the same rules as the permanent entries,
    appears in the tables and plots for that session, and disappears after refresh. This makes it easy to compare a new model
    without changing the permanent ranking.
  </p>

  <p>
    The next place to look is <strong>Main metrics</strong>. This is the compact overview of the most important quantities,
    and it shows the exon and CDS branches side by side at the same active tolerance \(k\). The control
    <strong>Active k</strong> sets the boundary tolerance currently used in the table, and <strong>Sort rows</strong> tells the
    table which score should define the ordering. Under each branch, the column <strong>F1 w/o seg.</strong> means
    interval-level F1 before the structural filter is applied. The column <strong>MI w/o seg.</strong> means multi-isoform
    recovery at the same interval level. The column <strong>F1 with seg.</strong> means F1 after interval-matched pairs are
    additionally required to pass the segmentation check. The column <strong>MI with seg.</strong> is the corresponding
    multi-isoform count after that same structural filter. Read the <strong>Exon</strong> side as recovery of transcript
    architecture, and the <strong>CDS</strong> side as recovery of coding structure.
  </p>

  <p>
    If you want to see how a score changes as the tolerance varies, use the curve view on the page together with Main metrics.
    That is the fastest way to understand whether a model is precise already at small \(k\) or improves only when the
    matching rule becomes more permissive. Drag your mouse over the curve to inspect values at different tolerances, and use
    that operating point to interpret the tables below.
  </p>

  <p>
    The <strong>Full metrics</strong> panel expands the summary at the currently active \(k\). The branch tabs switch between
    exon and CDS views. Inside the table, the block <strong>Interval level</strong> reports
    <strong>Precision</strong>, <strong>Recall</strong>, <strong>F1</strong>, and <strong>MI</strong> exactly as defined in the
    metric description. The block <strong>Segmentation level</strong> reports the same four quantities after the structural
    filter has been applied. The block <strong>Exact part level</strong> reports part-level
    <strong>Precision</strong>, <strong>Recall</strong>, and <strong>F1</strong> for pooled unique exon intervals in the exon branch
    or pooled unique CDS intervals in the CDS branch. This panel is where you go when the summary table tells you that two
    models differ and you want to see whether the difference comes from prediction purity, gene recovery, structural fidelity,
    isoform recovery, or exact part detection.
  </p>

  <p>
    The <strong>Stratifier</strong> panel answers a different question: where does a model perform well or poorly inside the
    benchmark? You choose a <strong>Model</strong>, a biologically meaningful grouping <strong>Rule</strong>, a branch, and an
    active \(k\). The rows then correspond to the selected groups, such as transcript type, strand, or chromosome. The
    columns <strong>Interval F1</strong> and <strong>Interval MI</strong> are the interval-level scores within that subset. The
    columns <strong>Segmentation F1</strong> and <strong>Segmentation MI</strong> are the corresponding scores after the
    segmentation filter. The column <strong>Exact part F1</strong> reports pooled exact exon or CDS recovery within the same
    subset. This panel is useful when a model looks strong on average but behaves unevenly across biological categories.
  </p>

  <p>
    The last panel, <strong>Detailed information</strong>, moves from model summaries to individual reference genes and
    transcripts. It starts from the ground-truth gene list. Once you open a gene, you can inspect its annotated transcripts and
    their basic attributes. Once you open a transcript, you can see which predictions matched it and the smallest tolerance
    \(k\) at which each match appears. This is the panel to use when you want to verify why a model gained or lost score on
    a particular biological example rather than only reading the aggregate numbers.
  </p>
`;

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

function formatScore(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  if (Number.isInteger(numeric)) {
    return `${numeric}`;
  }
  return numeric.toFixed(digits);
}

function formatSegments(segments) {
  if (!segments?.length) {
    return "—";
  }
  return segments.map(([start, end]) => `[${start}, ${end}]`).join(", ");
}

function SegmentBox({ segments }) {
  const value = formatSegments(segments);
  return (
    <Box className="segment-scrollbox mono" title={value}>
      {value}
    </Box>
  );
}

function BranchTabs({ value, onChange }) {
  return (
    <Tabs value={value} onChange={(_, next) => onChange(next)}>
      <Tab value="exon" label="Exon branch" />
      <Tab value="cds" label="CDS branch" />
    </Tabs>
  );
}

function modelValueAtK(overview, model, branch, metricKey, selectedK) {
  if (!overview || !model?.curves?.[branch]?.[metricKey]) {
    return null;
  }
  const index = Math.max(0, Math.min(Number(selectedK) || 0, overview.k_values.length - 1));
  return model.curves[branch][metricKey][index];
}

function computeColumnHighlights(rows, keys) {
  const highlights = {};
  for (const key of keys) {
    const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value));
    if (!values.length) {
      continue;
    }
    if (values.every((value) => value === values[0])) {
      continue;
    }
    highlights[key] = Math.max(...values);
  }
  return highlights;
}

function ReadonlyCellField({ value }) {
  return (
    <TextField
      value={value || "—"}
      fullWidth
      inputProps={{ readOnly: true }}
      className="mono"
      size="small"
      sx={{
        minWidth: 180,
        "& .MuiInputBase-input": {
          overflowX: "auto",
          whiteSpace: "nowrap",
        },
      }}
    />
  );
}

export default function LeaderboardPanel() {
  const uniformFieldSx = { "& .MuiInputBase-root": { height: 56 } };

  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [selectedKInput, setSelectedKInput] = useState("250");
  const [sortMetric, setSortMetric] = useState("exon_segmentation_f1");

  const [graphBranch, setGraphBranch] = useState("exon");
  const [graphMetric, setGraphMetric] = useState("segmentation_f1");
  const [selectedModels, setSelectedModels] = useState([]);

  const [fullBranch, setFullBranch] = useState("exon");
  const [fullMetrics, setFullMetrics] = useState(null);

  const [stratBranch, setStratBranch] = useState("exon");
  const [stratModel, setStratModel] = useState("");
  const [stratRule, setStratRule] = useState("transcript_type");
  const [stratifier, setStratifier] = useState(null);

  const [detailBranch, setDetailBranch] = useState("exon");
  const [geneQuery, setGeneQuery] = useState("");
  const [genePage, setGenePage] = useState(1);
  const [geneList, setGeneList] = useState({ items: [], total: 0, page: 1, page_size: 25 });
  const [geneDetails, setGeneDetails] = useState({});
  const [expandedGene, setExpandedGene] = useState(false);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadModelName, setUploadModelName] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [temporaryPreview, setTemporaryPreview] = useState(null);

  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const uploadInputRef = useRef(null);

  const selectedK = useMemo(() => {
    const parsed = Number(selectedKInput);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(parsed, 500));
  }, [selectedKInput]);

  const modelsCombined = useMemo(() => {
    const base = overview?.models || [];
    return temporaryPreview?.model ? [...base, temporaryPreview.model] : base;
  }, [overview, temporaryPreview]);

  const chartModels = useMemo(() => {
    if (!selectedModels.length) {
      return modelsCombined;
    }
    return modelsCombined.filter((item) => selectedModels.includes(item.model_id));
  }, [modelsCombined, selectedModels]);

  const chartData = useMemo(() => {
    if (!overview?.k_values?.length) {
      return [];
    }
    return overview.k_values.map((kValue, index) => {
      const row = { k: kValue };
      chartModels.forEach((model) => {
        row[model.model_id] = model?.curves?.[graphBranch]?.[graphMetric]?.[index] ?? null;
      });
      return row;
    });
  }, [overview, chartModels, graphBranch, graphMetric]);

  const mainRows = useMemo(() => {
    if (!modelsCombined.length) {
      return [];
    }

    const rows = modelsCombined.map((model) => ({
      model_id: model.model_id,
      display_name: model.display_name,
      temporary: model.temporary,
      exon_interval_f1: modelValueAtK(overview, model, "exon", "interval_f1", selectedK),
      exon_interval_mi: modelValueAtK(overview, model, "exon", "interval_mi", selectedK),
      exon_segmentation_f1: modelValueAtK(overview, model, "exon", "segmentation_f1", selectedK),
      exon_segmentation_mi: modelValueAtK(overview, model, "exon", "segmentation_mi", selectedK),
      cds_interval_f1: modelValueAtK(overview, model, "cds", "interval_f1", selectedK),
      cds_interval_mi: modelValueAtK(overview, model, "cds", "interval_mi", selectedK),
      cds_segmentation_f1: modelValueAtK(overview, model, "cds", "segmentation_f1", selectedK),
      cds_segmentation_mi: modelValueAtK(overview, model, "cds", "segmentation_mi", selectedK),
    }));

    rows.sort((a, b) => {
      const aValue = Number(a[sortMetric] ?? -Infinity);
      const bValue = Number(b[sortMetric] ?? -Infinity);
      if (bValue !== aValue) {
        return bValue - aValue;
      }
      return a.display_name.localeCompare(b.display_name);
    });

    return rows;
  }, [modelsCombined, overview, selectedK, sortMetric]);

  const mainColumnHighlights = useMemo(
    () =>
      computeColumnHighlights(mainRows, [
        "exon_interval_f1",
        "exon_interval_mi",
        "exon_segmentation_f1",
        "exon_segmentation_mi",
        "cds_interval_f1",
        "cds_interval_mi",
        "cds_segmentation_f1",
        "cds_segmentation_mi",
      ]),
    [mainRows],
  );

  const fullColumnHighlights = useMemo(
    () =>
      computeColumnHighlights(fullMetrics?.rows || [], [
        "interval_precision",
        "interval_recall",
        "interval_f1",
        "interval_mi",
        "segmentation_precision",
        "segmentation_recall",
        "segmentation_f1",
        "segmentation_mi",
        "part_precision",
        "part_recall",
        "part_f1",
      ]),
    [fullMetrics],
  );

  const totalGenePages = useMemo(() => {
    const total = Number(geneList?.total) || 0;
    const pageSize = Number(geneList?.page_size) || 25;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [geneList]);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/leaderboard/status");
      const payload = await response.json();
      setStatus(payload);
    } catch {
      setStatus({ error: "Failed to load leaderboard status." });
    }
  };

  const fetchOverview = async () => {
    try {
      const response = await fetch("/api/leaderboard/overview");
      const payload = await response.json();
      setOverview(payload);
    } catch {
      setOverview(null);
    }
  };

  const reloadLeaderboard = async () => {
    await Promise.all([fetchStatus(), fetchOverview()]);
  };

  useEffect(() => {
    reloadLeaderboard();
  }, []);

  useEffect(() => {
    if (!status?.running && !status?.upload_current) {
      return;
    }
    const intervalId = window.setInterval(() => {
      reloadLeaderboard();
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [status?.running, status?.upload_current]);

  useEffect(() => {
    if (window?.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [leaderboardExpanded, overview]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    setSelectedKInput((current) => (current === "" ? "" : current || `${overview.default_k ?? 250}`));

    if (modelsCombined.length > 0) {
      setSelectedModels((current) => {
        const allIds = modelsCombined.map((item) => item.model_id);
        if (!current.length) {
          return allIds;
        }
        const filtered = current.filter((item) => allIds.includes(item));
        const missing = allIds.filter((item) => !filtered.includes(item));
        return missing.length ? [...filtered, ...missing] : filtered;
      });
    }

    if ((!stratModel || !modelsCombined.some((item) => item.model_id === stratModel)) && modelsCombined.length > 0) {
      setStratModel(modelsCombined[0].model_id);
    }
  }, [overview, stratModel, modelsCombined]);

  useEffect(() => {
    if (!overview || !modelsCombined.length) {
      setFullMetrics(null);
      return;
    }

    const temporaryModelId = temporaryPreview?.model?.model_id;
    const fullMetricsModelIds = selectedModels.filter((item) => item !== temporaryModelId);
    const params = new URLSearchParams({
      branch: fullBranch,
      k: `${selectedK}`,
    });

    if (fullMetricsModelIds.length > 0) {
      params.set("model_ids", fullMetricsModelIds.join(","));
    }

    fetch(`/api/leaderboard/full-metrics?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        const rows = [...(payload.rows || [])];
        if (temporaryPreview && selectedModels.includes(temporaryModelId)) {
          const localRow = temporaryPreview.full_metrics?.[fullBranch]?.[selectedK];
          if (localRow) {
            rows.push(localRow);
          }
        }
        setFullMetrics({ ...payload, rows });
      })
      .catch(() => setFullMetrics(null));
  }, [overview, modelsCombined, fullBranch, selectedK, selectedModels, temporaryPreview]);

  useEffect(() => {
    if (!stratModel) {
      setStratifier(null);
      return;
    }

    if (temporaryPreview && stratModel === temporaryPreview.model.model_id) {
      const rows = Object.entries(temporaryPreview.stratifier?.[stratBranch]?.[stratRule] || {})
        .map(([groupName, perK]) => {
          const metrics = perK[selectedK];
          if (!metrics) {
            return null;
          }
          return {
            group: groupName,
            interval_precision: metrics["interval-level"]["precision"],
            interval_recall: metrics["interval-level"]["recall"],
            interval_f1: metrics["interval-level"]["f1"],
            interval_mi: metrics["interval-level"]["mi"],
            segmentation_precision: metrics["segmentation-level"]["precision"],
            segmentation_recall: metrics["segmentation-level"]["recall"],
            segmentation_f1: metrics["segmentation-level"]["f1"],
            segmentation_mi: metrics["segmentation-level"]["mi"],
            part_precision: metrics["part-level"]["precision"],
            part_recall: metrics["part-level"]["recall"],
            part_f1: metrics["part-level"]["f1"],
          };
        })
        .filter(Boolean);

      rows.sort((a, b) => Number(b.segmentation_f1) - Number(a.segmentation_f1));
      setStratifier({ rows });
      return;
    }

    const params = new URLSearchParams({
      model_id: stratModel,
      branch: stratBranch,
      rule: stratRule,
      k: `${selectedK}`,
    });

    fetch(`/api/leaderboard/stratifier?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setStratifier(payload))
      .catch(() => setStratifier(null));
  }, [stratModel, stratBranch, stratRule, selectedK, temporaryPreview]);

  useEffect(() => {
    const params = new URLSearchParams({
      branch: detailBranch,
      query: geneQuery,
      page: `${genePage}`,
      page_size: "25",
    });

    fetch(`/api/leaderboard/genes?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setGeneList(payload))
      .catch(() => setGeneList({ items: [], total: 0, page: 1, page_size: 25 }));
  }, [detailBranch, geneQuery, genePage]);

  const fetchGeneDetail = useCallback(async (geneId) => {
    const cacheKey = `${detailBranch}|${geneId}|${selectedK}|${selectedModels.join(",")}`;
    if (geneDetails[cacheKey]) {
      return;
    }

    const temporaryModelId = temporaryPreview?.model?.model_id;
    const geneDetailModelIds = selectedModels.filter((item) => item !== temporaryModelId);
    const params = new URLSearchParams({
      branch: detailBranch,
      k: `${selectedK}`,
    });

    if (geneDetailModelIds.length > 0) {
      params.set("model_ids", geneDetailModelIds.join(","));
    }

    const response = await fetch(`/api/leaderboard/gene/${encodeURIComponent(geneId)}?${params.toString()}`);
    const payload = await response.json();

    if (temporaryPreview && selectedModels.includes(temporaryModelId)) {
      payload.gene.transcripts = payload.gene.transcripts.map((transcript) => {
        const local = temporaryPreview.detailed?.[detailBranch]?.[transcript.transcript_id];
        if (!local) {
          return transcript;
        }

        const intervalMap = Object.fromEntries(
          (local["interval-level"]?.predictions || [])
            .filter((item) => item.min_k !== null && item.min_k !== undefined)
            .map((item) => [item.pred_id, Number(item.min_k)]),
        );

        const segmentationMap = Object.fromEntries(
          (local["segmentation-level"]?.predictions || [])
            .filter((item) => item.min_k !== null && item.min_k !== undefined)
            .map((item) => [item.pred_id, Number(item.min_k)]),
        );

        const extras = [...new Set([...Object.keys(intervalMap), ...Object.keys(segmentationMap)])].map((predId) => {
          const predMeta = temporaryPreview.prediction_index?.[predId] || {};
          const candidates = [intervalMap[predId], segmentationMap[predId]].filter((value) => Number.isFinite(value));
          const minK = candidates.length ? Math.min(...candidates) : null;
          return {
            model_id: temporaryModelId,
            model_name: temporaryPreview.model.display_name,
            temporary: true,
            pred_id: predId,
            chromosome: predMeta.chromosome,
            start: predMeta.start,
            end: predMeta.end,
            strand: predMeta.strand,
            exon_segments: predMeta.exon_segments || [],
            cds_segments: predMeta.cds_segments || [],
            min_k: minK,
            matched_at_k: minK !== null && minK <= selectedK,
          };
        });

        return {
          ...transcript,
          matched_predictions: [...transcript.matched_predictions, ...extras],
          matched_prediction_count: transcript.matched_predictions.length + extras.length,
        };
      });
    }

    setGeneDetails((current) => ({ ...current, [cacheKey]: payload }));
  }, [detailBranch, geneDetails, selectedK, selectedModels, temporaryPreview]);

  useEffect(() => {
    if (!geneList.items?.length || !selectedModels.length) {
      return;
    }
    geneList.items.forEach((gene) => {
      fetchGeneDetail(gene.gene_id);
    });
  }, [geneList.items, fetchGeneDetail, selectedModels.length]);

  const submitPreview = async () => {
    setUploadMessage("");

    if (!uploadFile) {
      setUploadMessage("Please choose a prediction GFF file.");
      return;
    }

    setUploadLoading(true);
    try {
      const predGffText = await uploadFile.text();
      const baseName = uploadFile.name.replace(/\.[^.]+$/, "") || "Temporary preview";
      const modelName = uploadModelName.trim() || baseName;

      const response = await fetch("/api/leaderboard/temporary-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: modelName,
          pred_gff_text: predGffText,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setUploadMessage(payload.detail || "Upload failed.");
        return;
      }

      setTemporaryPreview(payload);
      setUploadMessage(
        "Temporary preview computed. It is visible only in this session and disappears after page refresh.",
      );
      setGeneDetails({});
      setUploadFile(null);
      setUploadModelName("");

      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    } catch (error) {
      setUploadMessage(error?.message || "Upload failed.");
    } finally {
      setUploadLoading(false);
    }
  };

  const showProgress = Boolean(status?.running || status?.upload_current);

  const progressValue = useMemo(() => {
    if (!status?.total_models) {
      return 0;
    }
    return Math.round(((status.completed_models || 0) / status.total_models) * 100);
  }, [status]);

  const progressPreviewValue = useMemo(() => {
    if (!status?.total_models) {
      return 0;
    }
    const message = `${status?.message || ""}`;
    const matched = message.match(/\((\d+)\s*\/\s*(\d+)\)/);
    if (matched) {
      const current = Number(matched[1]);
      const total = Number(matched[2]);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        return Math.max(progressValue, Math.round((current / total) * 100));
      }
    }
    return progressValue;
  }, [status, progressValue]);

  return (
    <Stack spacing={3.2}>
      <Paper className="glass-card hero-card" sx={{ p: { xs: 2.4, md: 3.4 } }}>
        <Stack spacing={2}>
          <SectionTitle
            title="Leaderboard description"
            subtitle="Scientifically interpretable comparison of ab initio annotation models."
          />

          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                maxHeight: leaderboardExpanded ? "none" : 340,
                overflow: "hidden",
                pr: 0.5,
              }}
            >
              <Box className="metric-description" dangerouslySetInnerHTML={{ __html: LEADERBOARD_DESCRIPTION_HTML }} />
            </Box>

            {!leaderboardExpanded ? (
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

            <Button variant="text" onClick={() => setLeaderboardExpanded((value) => !value)} sx={{ mt: 0.8 }}>
              {leaderboardExpanded ? "Show less" : "Show more"}
            </Button>
          </Box>

          {showProgress ? (
            <Stack spacing={1.1}>
              <LinearProgress
                variant={status?.total_models ? "determinate" : "indeterminate"}
                value={progressPreviewValue}
              />
              <Typography color="text.secondary">{status?.message || "Loading leaderboard…"}</Typography>
            </Stack>
          ) : null}

          {status?.error ? <Alert severity="error">{status.error}</Alert> : null}

          {status?.missing_ground_truth ? (
            <Alert
              severity="warning"
              action={
                <Button onClick={reloadLeaderboard} startIcon={<RefreshIcon />}>
                  Reload
                </Button>
              }
            >
              {status.message}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={1.8}>
          <SectionTitle
            title="Temporary submission"
            subtitle="Upload a prediction GFF and compute a temporary preview for this browser session only."
          />

          <Typography color="text.secondary">
            Temporary submissions are computed on demand and shown only on this page for the current session. They are
            not written to persistent Space storage and are removed after refresh. For permanent inclusion, open a pull
            request to the permanent repository.
          </Typography>

          <TextField
            label="Model name"
            value={uploadModelName}
            onChange={(event) => setUploadModelName(event.target.value)}
            placeholder="My model"
            sx={uniformFieldSx}
          />

          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
            {uploadFile ? uploadFile.name : "Choose prediction GFF"}
            <input
              ref={uploadInputRef}
              hidden
              type="file"
              accept=".gff,.gff3,.gtf,.txt"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setUploadFile(nextFile);
                if (nextFile && !uploadModelName.trim()) {
                  const baseName = nextFile.name.replace(/\.[^.]+$/, "");
                  setUploadModelName(baseName);
                }
              }}
            />
          </Button>

          <Button variant="contained" onClick={submitPreview} disabled={uploadLoading}>
            Submit
          </Button>

          {uploadLoading ? (
            <Box className="score-calc-animation">
              <span className="orb" />
              <Typography color="text.secondary">Calculating score trajectories and transcript evidence…</Typography>
            </Box>
          ) : null}

          {uploadMessage ? <Alert severity="info">{uploadMessage}</Alert> : null}

          <Alert severity="info">
            Permanent repository:{" "}
            <span className="mono">
              {overview?.source_repository_url ||
                "https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git"}
            </span>
          </Alert>
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={1.2}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", lg: "center" }}
          >
            <SectionTitle
              title="Main metrics"
              subtitle="The table is evaluated at a user-selected tolerance k and shows both exon and CDS branches simultaneously."
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <TextField
                label="Active k"
                type="number"
                value={selectedKInput}
                onChange={(event) => setSelectedKInput(event.target.value)}
                onBlur={() => {
                  if (selectedKInput === "") {
                    return;
                  }
                  const parsed = Number(selectedKInput);
                  if (!Number.isFinite(parsed)) {
                    setSelectedKInput("0");
                    return;
                  }
                  setSelectedKInput(`${Math.max(0, Math.min(parsed, 500))}`);
                }}
                inputProps={{ min: 0, max: 500 }}
                sx={{ width: 120, ...uniformFieldSx }}
              />

              <TextField
                select
                label="Sort rows"
                value={sortMetric}
                onChange={(event) => setSortMetric(event.target.value)}
                sx={{ minWidth: 320, ...uniformFieldSx }}
              >
                {SORT_METRICS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>

          {!modelsCombined.length ? (
            <Alert severity="info">No leaderboard models are available yet.</Alert>
          ) : (
            <Box className="result-table-wrap">
              <Table className="metric-table main-metrics-table">
                <TableHead>
                  <TableRow>
                    <TableCell rowSpan={2}>Rank</TableCell>
                    <TableCell rowSpan={2}>Model</TableCell>
                    <TableCell colSpan={4} align="center">
                      Exon
                    </TableCell>
                    <TableCell colSpan={4} align="center">
                      CDS
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>F1 w/o seg.</TableCell>
                    <TableCell>MI w/o seg.</TableCell>
                    <TableCell className="rank-column-highlight">F1 with seg.</TableCell>
                    <TableCell>MI with seg.</TableCell>
                    <TableCell>F1 w/o seg.</TableCell>
                    <TableCell>MI w/o seg.</TableCell>
                    <TableCell className="rank-column-highlight">F1 with seg.</TableCell>
                    <TableCell>MI with seg.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mainRows.map((row, index) => (
                    <TableRow key={row.model_id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography fontWeight={760}>{row.display_name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell
                        sx={
                          mainColumnHighlights.exon_interval_f1 !== undefined &&
                          Number(row.exon_interval_f1) === mainColumnHighlights.exon_interval_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.exon_interval_f1)}
                      </TableCell>
                      <TableCell
                        sx={
                          mainColumnHighlights.exon_interval_mi !== undefined &&
                          Number(row.exon_interval_mi) === mainColumnHighlights.exon_interval_mi
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.exon_interval_mi, 0)}
                      </TableCell>
                      <TableCell
                        className="rank-column-highlight"
                        sx={
                          mainColumnHighlights.exon_segmentation_f1 !== undefined &&
                          Number(row.exon_segmentation_f1) === mainColumnHighlights.exon_segmentation_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.exon_segmentation_f1)}
                      </TableCell>
                      <TableCell
                        sx={
                          mainColumnHighlights.exon_segmentation_mi !== undefined &&
                          Number(row.exon_segmentation_mi) === mainColumnHighlights.exon_segmentation_mi
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.exon_segmentation_mi, 0)}
                      </TableCell>
                      <TableCell
                        sx={
                          mainColumnHighlights.cds_interval_f1 !== undefined &&
                          Number(row.cds_interval_f1) === mainColumnHighlights.cds_interval_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.cds_interval_f1)}
                      </TableCell>
                      <TableCell
                        sx={
                          mainColumnHighlights.cds_interval_mi !== undefined &&
                          Number(row.cds_interval_mi) === mainColumnHighlights.cds_interval_mi
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.cds_interval_mi, 0)}
                      </TableCell>
                      <TableCell
                        className="rank-column-highlight"
                        sx={
                          mainColumnHighlights.cds_segmentation_f1 !== undefined &&
                          Number(row.cds_segmentation_f1) === mainColumnHighlights.cds_segmentation_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.cds_segmentation_f1)}
                      </TableCell>
                      <TableCell
                        sx={
                          mainColumnHighlights.cds_segmentation_mi !== undefined &&
                          Number(row.cds_segmentation_mi) === mainColumnHighlights.cds_segmentation_mi
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.cds_segmentation_mi, 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              title="Metric curves"
              subtitle="Choose the branch, metric, and models to inspect smooth trajectories over k = 0…500. Click the chart to set the active operating point."
            />
            <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2} alignItems={{ lg: "center" }}>
              <BranchTabs value={graphBranch} onChange={setGraphBranch} />
              <TextField
                select
                label="Metric"
                value={graphMetric}
                onChange={(event) => setGraphMetric(event.target.value)}
                sx={{ minWidth: 240 }}
              >
                {Object.entries(METRIC_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>

          <Autocomplete
            multiple
            options={modelsCombined}
            value={modelsCombined.filter((item) => selectedModels.includes(item.model_id))}
            disableCloseOnSelect
            getOptionLabel={(option) => option.display_name}
            isOptionEqualToValue={(option, value) => option.model_id === value.model_id}
            onChange={(_, value) => setSelectedModels(value.map((item) => item.model_id))}
            renderInput={(params) => <TextField {...params} label="Models shown on the graph" />}
          />

          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 24, bottom: 10, left: 8 }}
                onClick={(event) => {
                  if (event?.activeLabel !== undefined && event?.activeLabel !== null) {
                    setSelectedKInput(`${Number(event.activeLabel)}`);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="k" type="number" domain={[0, 500]} allowDecimals={false} ticks={CHART_AXIS_TICKS} />
                <YAxis />
                <Tooltip
                  formatter={(value) => {
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric.toFixed(4) : "—";
                  }}
                />
                <Legend />
                {CHART_AXIS_TICKS.map((tick) => (
                  <ReferenceLine key={`tick-${tick}`} x={tick} stroke="#94a3b8" strokeDasharray="4 4" />
                ))}
                <ReferenceLine x={selectedK} stroke="#334155" strokeDasharray="4 4" />
                {chartModels.map((model, index) => (
                  <Line
                    key={model.model_id}
                    dataKey={model.model_id}
                    name={model.display_name}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    dot={false}
                    type="monotone"
                    strokeWidth={2.4}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              title="Full metrics"
              subtitle="Complete metric table at the active k for the models selected in the graph panel."
            />
            <BranchTabs value={fullBranch} onChange={setFullBranch} />
          </Stack>

          {!fullMetrics?.rows?.length ? (
            <Alert severity="info">No full-metric rows are available for the current selection.</Alert>
          ) : (
            <Box className="result-table-wrap">
              <Table className="metric-table full-metrics-table">
                <TableHead>
                  <TableRow>
                    <TableCell rowSpan={2}>Model</TableCell>
                    <TableCell colSpan={4} align="center">
                      Interval level
                    </TableCell>
                    <TableCell colSpan={4} align="center">
                      Segmentation level
                    </TableCell>
                    <TableCell colSpan={3} align="center">
                      Exact part level
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Precision</TableCell>
                    <TableCell>Recall</TableCell>
                    <TableCell>F1</TableCell>
                    <TableCell>MI</TableCell>
                    <TableCell>Precision</TableCell>
                    <TableCell>Recall</TableCell>
                    <TableCell>F1</TableCell>
                    <TableCell>MI</TableCell>
                    <TableCell>Precision</TableCell>
                    <TableCell>Recall</TableCell>
                    <TableCell>F1</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fullMetrics.rows.map((row) => (
                    <TableRow key={row.model_id}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography fontWeight={760}>{row.display_name}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.interval_precision !== undefined &&
                          Number(row.interval_precision) === fullColumnHighlights.interval_precision
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.interval_precision)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.interval_recall !== undefined &&
                          Number(row.interval_recall) === fullColumnHighlights.interval_recall
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.interval_recall)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.interval_f1 !== undefined &&
                          Number(row.interval_f1) === fullColumnHighlights.interval_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.interval_f1)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.interval_mi !== undefined &&
                          Number(row.interval_mi) === fullColumnHighlights.interval_mi
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.interval_mi, 0)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.segmentation_precision !== undefined &&
                          Number(row.segmentation_precision) === fullColumnHighlights.segmentation_precision
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.segmentation_precision)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.segmentation_recall !== undefined &&
                          Number(row.segmentation_recall) === fullColumnHighlights.segmentation_recall
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.segmentation_recall)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.segmentation_f1 !== undefined &&
                          Number(row.segmentation_f1) === fullColumnHighlights.segmentation_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.segmentation_f1)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.segmentation_mi !== undefined &&
                          Number(row.segmentation_mi) === fullColumnHighlights.segmentation_mi
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.segmentation_mi, 0)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.part_precision !== undefined &&
                          Number(row.part_precision) === fullColumnHighlights.part_precision
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.part_precision)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.part_recall !== undefined &&
                          Number(row.part_recall) === fullColumnHighlights.part_recall
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.part_recall)}
                      </TableCell>
                      <TableCell
                        sx={
                          fullColumnHighlights.part_f1 !== undefined &&
                          Number(row.part_f1) === fullColumnHighlights.part_f1
                            ? { fontWeight: 800 }
                            : {}
                        }
                      >
                        {formatScore(row.part_f1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              title="Stratifier"
              subtitle="Select a model and a biologically meaningful grouping rule to inspect branch-specific behaviour within subsets of the benchmark."
            />
            <BranchTabs value={stratBranch} onChange={setStratBranch} />
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 5fr) minmax(0, 4fr) minmax(0, 3fr)" },
              gap: 2,
              width: "100%",
            }}
          >
            <TextField
              select
              label="Model"
              fullWidth
              value={stratModel}
              onChange={(event) => setStratModel(event.target.value)}
              sx={uniformFieldSx}
            >
              {modelsCombined.map((model) => (
                <MenuItem key={model.model_id} value={model.model_id}>
                  {model.display_name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Rule"
              fullWidth
              value={stratRule}
              onChange={(event) => setStratRule(event.target.value)}
              sx={uniformFieldSx}
            >
              {(overview?.available_stratifiers || []).map((rule) => (
                <MenuItem key={rule.value} value={rule.value}>
                  {rule.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField label="Active k" value={selectedK} fullWidth disabled sx={uniformFieldSx} />
          </Box>

          {!stratifier?.rows?.length ? (
            <Alert severity="info">No stratified rows are available for the current selection.</Alert>
          ) : (
            <Box className="result-table-wrap">
              <Table className="metric-table">
                <TableHead>
                  <TableRow>
                    <TableCell>Group</TableCell>
                    <TableCell>Interval F1</TableCell>
                    <TableCell>Interval MI</TableCell>
                    <TableCell>Segmentation F1</TableCell>
                    <TableCell>Segmentation MI</TableCell>
                    <TableCell>Exact part F1</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stratifier.rows.map((row) => (
                    <TableRow key={row.group}>
                      <TableCell>{row.group}</TableCell>
                      <TableCell>{formatScore(row.interval_f1)}</TableCell>
                      <TableCell>{formatScore(row.interval_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.segmentation_f1)}</TableCell>
                      <TableCell>{formatScore(row.segmentation_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.part_f1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              title="Detailed information"
              subtitle="Transcript-level evidence and matched prediction counts per gene."
            />
            <BranchTabs
              value={detailBranch}
              onChange={(next) => {
                setDetailBranch(next);
                setGenePage(1);
                setExpandedGene(false);
              }}
            />
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2 }}>
            <TextField
              fullWidth
              label="Search ground-truth genes, transcripts, chromosome, or type"
              value={geneQuery}
              onChange={(event) => {
                setGeneQuery(event.target.value);
                setGenePage(1);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                  </InputAdornment>
                ),
              }}
              sx={uniformFieldSx}
            />
            <TextField label="Active k" value={selectedK} disabled sx={uniformFieldSx} />
          </Box>

          {geneList.items?.length === 0 ? (
            <Alert severity="info">No ground-truth genes match the current filter.</Alert>
          ) : (
            <Stack spacing={1.1}>
              {geneList.items.map((gene) => {
                const cacheKey = `${detailBranch}|${gene.gene_id}|${selectedK}|${selectedModels.join(",")}`;
                const detail = geneDetails[cacheKey];
                const matchedAcrossGene = detail
                  ? detail.gene.transcripts.reduce(
                      (accumulator, transcript) => accumulator + (transcript.matched_prediction_count || 0),
                      0,
                    )
                  : null;

                return (
                  <Accordion
                    key={`${detailBranch}-${gene.gene_id}`}
                    expanded={expandedGene === gene.gene_id}
                    onChange={(_, isExpanded) => {
                      const next = isExpanded ? gene.gene_id : false;
                      setExpandedGene(next);
                      if (isExpanded) {
                        fetchGeneDetail(gene.gene_id);
                      }
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Stack spacing={0.6} sx={{ width: "100%" }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight={760}>{gene.gene_id}</Typography>
                          {(gene.transcript_types || []).map((item) => (
                            <Chip size="small" key={`${gene.gene_id}-${item}`} label={item} />
                          ))}
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${gene.chromosome}:${gene.start}-${gene.end} (${gene.strand})`}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {gene.transcript_count} transcript{gene.transcript_count === 1 ? "" : "s"}
                          {matchedAcrossGene !== null
                            ? ` · ${matchedAcrossGene} matched predictions across all transcripts`
                            : ""}
                        </Typography>
                      </Stack>
                    </AccordionSummary>

                    <AccordionDetails>
                      {!detail ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CircularProgress size={20} />
                          <Typography color="text.secondary">Loading transcript-level details…</Typography>
                        </Stack>
                      ) : (
                        <Stack spacing={1.1}>
                          {detail.gene.transcripts.map((transcript) => (
                            <Accordion key={transcript.transcript_id} className="nested-accordion">
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Stack spacing={0.5} sx={{ width: "100%" }}>
                                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                    <Typography fontWeight={760}>{transcript.transcript_id}</Typography>
                                    <Chip size="small" label={transcript.transcript_type} />
                                    <Chip size="small" variant="outlined" label={`${transcript.length} nt`} />
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={`${transcript.matched_prediction_count} matched predictions`}
                                    />
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={`${transcript.chromosome}:${transcript.start}-${transcript.end}`}
                                    />
                                    <Chip size="small" variant="outlined" label={`strand ${transcript.strand}`} />
                                  </Stack>
                                </Stack>
                              </AccordionSummary>

                              <AccordionDetails>
                                <Stack spacing={1.2}>
                                  <Box
                                    sx={{
                                      display: "grid",
                                      gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
                                      gap: 2,
                                      width: "100%",
                                    }}
                                  >
                                    <Box>
                                      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>
                                        Ground-truth exon segments
                                      </Typography>
                                      <SegmentBox segments={transcript.exon_segments} />
                                    </Box>
                                    <Box>
                                      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>
                                        Ground-truth CDS segments
                                      </Typography>
                                      <SegmentBox segments={transcript.cds_segments} />
                                    </Box>
                                  </Box>

                                  {!transcript.matched_predictions.length ? (
                                    <Alert severity="info">
                                      No selected models match this transcript at the current branch.
                                    </Alert>
                                  ) : (
                                    <Box className="result-table-wrap" sx={{ width: "100%", m: 0 }}>
                                      <Table className="metric-table details-table">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Model</TableCell>
                                            <TableCell>Strand</TableCell>
                                            <TableCell>Prediction</TableCell>
                                            <TableCell>Coordinate</TableCell>
                                            <TableCell>Exon segments</TableCell>
                                            <TableCell>CDS segments</TableCell>
                                            <TableCell>Min k</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {transcript.matched_predictions.map((match) => (
                                            <TableRow key={`${transcript.transcript_id}-${match.model_id}-${match.pred_id}`}>
                                              <TableCell>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                  <Typography>{match.model_name}</Typography>
                                                </Stack>
                                              </TableCell>
                                              <TableCell>{match.strand || "—"}</TableCell>
                                              <TableCell>
                                                <ReadonlyCellField value={match.pred_id} />
                                              </TableCell>
                                              <TableCell>
                                                <ReadonlyCellField
                                                  value={
                                                    match.chromosome
                                                      ? `${match.chromosome}:${match.start}-${match.end}`
                                                      : "—"
                                                  }
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <SegmentBox segments={match.exon_segments} />
                                              </TableCell>
                                              <TableCell>
                                                <SegmentBox segments={match.cds_segments} />
                                              </TableCell>
                                              <TableCell>{formatScore(match.min_k, 0)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </Box>
                                  )}
                                </Stack>
                              </AccordionDetails>
                            </Accordion>
                          ))}
                        </Stack>
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })}

              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.2}>
                <Typography color="text.secondary">
                  Page {geneList.page || genePage} of {totalGenePages} · {geneList.total || 0} matching genes
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button disabled={genePage <= 1} onClick={() => setGenePage((value) => Math.max(1, value - 1))}>
                    Previous
                  </Button>
                  <Button
                    disabled={genePage >= totalGenePages}
                    onClick={() => setGenePage((value) => Math.min(totalGenePages, value + 1))}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
