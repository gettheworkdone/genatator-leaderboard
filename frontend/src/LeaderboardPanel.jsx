import React, { useEffect, useMemo, useRef, useState } from "react";
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
const CHART_TICKS = [0, 150, 250, 350, 500];

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
  <p>The leaderboard is the comparative layer built on top of the metric described above. Its role is not to display a single ranking number, but to organize the metric outputs so that differences between models remain biologically interpretable. For that reason, the main table reports eight summary values: interval-level F1, interval-level MI, segmentation-level F1, and segmentation-level MI for the <strong>exon</strong> branch, and the same four quantities for the <strong>CDS</strong> branch.</p>
  <p>The graph panel then shows any selected metric as a function of the tolerance parameter \\(k\\). This presentation is essential, because models that appear similar at one threshold may behave very differently across the full tolerance range. A model that improves only at large \\(k\\) is fundamentally different from a model that is already accurate near exact matching. Therefore, the curve view reveals boundary precision, robustness, and error sensitivity more clearly than a single operating point.</p>
  <p>Once a specific value of \\(k\\) is selected, the <strong>Full metrics</strong> panel expands the summary into its components: matched and unmatched predictions, recovered and missed genes, MI counts, and exact exon or CDS part-level scores. In this way, a model’s position on the leaderboard can be explained rather than merely stated, since improvements can be traced to precision, recall, structural correctness, or isoform recovery.</p>
  <p>The <strong>Stratifier</strong> panel presents the same metric outputs after grouping the data by strand, chromosome, or transcript type. As a result, users can determine whether a model is uniformly strong or whether its performance is concentrated in particular biological contexts. This grouped view is especially important when global averages would otherwise conceal systematic weaknesses.</p>
  <p>The <strong>Detailed information</strong> panel provides transcript-resolved evidence for every ground-truth gene. For each reference transcript, it lists the supporting predictions, the minimum tolerance at which each support appears, and the contribution of the parent gene to multi-isoform recovery. Thus, the leaderboard remains auditable from the highest-level comparison down to individual biological objects.</p>
  <p>In addition, the leaderboard allows temporary evaluation of user-supplied GFF predictions under the same rules. These temporary entries appear alongside the permanent models during the current session, while permanent inclusion requires adding the prediction to the maintained repository. This keeps model comparison open and reproducible without turning the leaderboard itself into long-term storage for arbitrary uploads.</p>
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
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return Number(value).toFixed(digits);
}

function formatSegments(segments) {
  if (!segments || segments.length === 0) {
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
const formatScore = (v, d = 3) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : (Number.isInteger(v) ? `${v}` : Number(v).toFixed(d)));
const formatSegments = (segments) => (!segments?.length ? "—" : segments.map(([s, e]) => `[${s}, ${e}]`).join(", "));

function BranchTabs({ value, onChange }) { return <Tabs value={value} onChange={(_, next) => onChange(next)}><Tab value="exon" label="Exon branch" /><Tab value="cds" label="CDS branch" /></Tabs>; }

function modelValueAtK(overview, model, branch, metricKey, selectedK) {
  if (!overview || !model?.curves?.[branch]?.[metricKey]) return null;
  const index = Math.max(0, Math.min(Number(selectedK) || 0, overview.k_values.length - 1));
  return model.curves[branch][metricKey][index];
}

function computeColumnHighlights(rows, keys) {
  const highlights = {};
  for (const key of keys) {
    const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value));
    if (!values.length) continue;
    if (values.every((value) => value === values[0])) continue;
    highlights[key] = Math.max(...values);
  }
  return highlights;
}

function MetricChip({ label, value, temporary = false }) {
  return (
    <Chip
      size="small"
      variant={temporary ? "outlined" : "filled"}
      label={`${label}: ${value ? "✓" : "✗"}`}
    />
  );
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
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [temporaryPreview, setTemporaryPreview] = useState(null);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const uploadInputRef = useRef(null);

  const selectedK = useMemo(() => {
    const parsed = Number(selectedKInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(parsed, 500));
  }, [selectedKInput]);

  const fetchStatus = async () => setStatus(await (await fetch("/api/leaderboard/status")).json());
  const fetchOverview = async () => setOverview(await (await fetch("/api/leaderboard/overview")).json());

  useEffect(() => { fetchStatus(); fetchOverview(); }, []);

  const modelsCombined = useMemo(() => {
    const base = overview?.models || [];
    return temporaryPreview?.model ? [...base, temporaryPreview.model] : base;
  }, [overview, temporaryPreview]);

  useEffect(() => {
    if (window?.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [leaderboardExpanded, overview]);

  const modelsCombined = useMemo(() => {
    const base = overview?.models || [];
    return temporaryPreview?.model ? [...base, temporaryPreview.model] : base;
  }, [overview, temporaryPreview]);

  useEffect(() => {
    if (window?.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [leaderboardExpanded, overview]);

  const modelsCombined = useMemo(() => {
    const base = overview?.models || [];
    return temporaryPreview?.model ? [...base, temporaryPreview.model] : base;
  }, [overview, temporaryPreview]);

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
    const permanentIds = selectedModels.filter((item) => item !== temporaryModelId);
    const params = new URLSearchParams({
      branch: fullBranch,
      k: `${selectedK}`,
    });
    if (permanentIds.length > 0) {
      params.set("model_ids", permanentIds.join(","));
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
  }, [overview, fullBranch, selectedK, selectedModels, temporaryPreview, modelsCombined.length]);

  useEffect(() => {
    if (!stratModel) {
      setStratifier(null);
      return;
    }
    if (temporaryPreview && stratModel === temporaryPreview.model.model_id) {
      const rows = Object.entries(
        temporaryPreview.stratifier?.[stratBranch]?.[stratRule] || {},
      )
        .map(([groupName, perK]) => {
          const metrics = perK[selectedK];
          if (!metrics) return null;
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
      const av = Number(a[sortMetric] ?? -Infinity);
      const bv = Number(b[sortMetric] ?? -Infinity);
      if (bv !== av) return bv - av;
      return a.display_name.localeCompare(b.display_name);
    });
    return rows;
  }, [overview, modelsCombined, selectedK, sortMetric]);

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

  const chartModels = useMemo(() => {
    if (!selectedModels.length) {
      return modelsCombined;
    }
    return modelsCombined.filter((item) => selectedModels.includes(item.model_id));
  }, [modelsCombined, selectedModels]);

  useEffect(() => {
    if (!overview || !modelsCombined.length) return;
    const permanentIds = selectedModels.filter((id) => !temporaryPreview || id !== temporaryPreview.model.model_id);
    const params = new URLSearchParams({ branch: fullBranch, k: `${selectedK}` });
    if (permanentIds.length) params.set("model_ids", permanentIds.join(","));
    fetch(`/api/leaderboard/full-metrics?${params.toString()}`).then((r) => r.json()).then((payload) => {
      const rows = payload.rows || [];
      if (temporaryPreview && selectedModels.includes(temporaryPreview.model.model_id)) rows.push(temporaryPreview.full_metrics?.[fullBranch]?.[selectedK]);
      setFullMetrics({ ...payload, rows: rows.filter(Boolean) });
    }).catch(() => setFullMetrics(null));
  }, [overview, fullBranch, selectedK, selectedModels, temporaryPreview, modelsCombined.length]);

  const fullHighlights = useMemo(() => getColumnHighlights(fullMetrics?.rows || [], ["interval_precision", "interval_recall", "interval_f1", "interval_mi", "segmentation_precision", "segmentation_recall", "segmentation_f1", "segmentation_mi", "part_precision", "part_recall", "part_f1"]), [fullMetrics]);

  useEffect(() => {
    if (!stratModel) return;
    if (temporaryPreview && stratModel === temporaryPreview.model.model_id) {
      const rows = Object.entries(temporaryPreview.stratifier?.[stratBranch]?.[stratRule] || {}).map(([group, perK]) => {
        const metrics = perK[selectedK];
        if (!metrics) return null;
        return { group, interval_f1: metrics["interval-level"].f1, interval_mi: metrics["interval-level"].mi, segmentation_f1: metrics["segmentation-level"].f1, segmentation_mi: metrics["segmentation-level"].mi, part_f1: metrics["part-level"].f1 };
      }).filter(Boolean);
      setStratifier({ rows });
      return;
    }
    const params = new URLSearchParams({ model_id: stratModel, branch: stratBranch, rule: stratRule, k: `${selectedK}` });
    fetch(`/api/leaderboard/stratifier?${params.toString()}`).then((r) => r.json()).then(setStratifier).catch(() => setStratifier(null));
  }, [stratModel, stratBranch, stratRule, selectedK, temporaryPreview]);

  useEffect(() => {
    const params = new URLSearchParams({ branch: detailBranch, query: geneQuery, page: `${genePage}`, page_size: "25" });
    fetch(`/api/leaderboard/genes?${params.toString()}`).then((r) => r.json()).then(setGeneList).catch(() => setGeneList({ items: [], total: 0, page: 1, page_size: 25 }));
  }, [detailBranch, geneQuery, genePage]);

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

  const fetchGeneDetail = async (geneId) => {
    const tempId = temporaryPreview?.model?.model_id;
    const permanentIds = selectedModels.filter((id) => id !== tempId);
    const cacheKey = `${detailBranch}|${geneId}|${selectedK}|${selectedModels.join(",")}`;
    if (geneDetails[cacheKey]) {
      return;
    }
    const temporaryModelId = temporaryPreview?.model?.model_id;
    const permanentIds = selectedModels.filter((item) => item !== temporaryModelId);
    const params = new URLSearchParams({
      branch: detailBranch,
      k: `${selectedK}`,
    });
    if (permanentIds.length > 0) {
      params.set("model_ids", permanentIds.join(","));
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
  };

  const submitPreview = async () => {
    setUploadMessage("");
    if (!uploadFile) {
      setUploadMessage("Please choose a prediction GFF file.");
      return;
    }
    setUploadLoading(true);
    try {
      const pred_gff_text = await uploadFile.text();
      const response = await fetch("/api/leaderboard/temporary-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: "Temporary preview",
          pred_gff_text,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setUploadMessage(payload.detail || "Upload failed.");
        return;
      }
      setTemporaryPreview(payload);
      setUploadMessage("Temporary preview computed. It is visible only in this session and disappears after page refresh.");
      setGeneDetails({});
      setUploadFile(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    } finally {
      setUploadLoading(false);
    }
  };

  const showProgress = status?.running || status?.upload_current;
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
        <Stack spacing={2.0}>
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
            ><Box className="metric-description" dangerouslySetInnerHTML={{ __html: LEADERBOARD_DESCRIPTION_HTML }} /></Box>
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
              <Typography color="text.secondary">
                {status?.message || "Loading leaderboard…"}
              </Typography>
            </Stack>
          ) : null}
          {status?.error ? <Alert severity="error">{status.error}</Alert> : null}
          {status?.missing_ground_truth ? (
            <Alert severity="warning" action={<Button onClick={reloadLeaderboard} startIcon={<RefreshIcon />}>Reload</Button>}>
              {status.message}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
          <Stack spacing={1.8}>
            <SectionTitle
              title="Temporary custom submission"
              subtitle="Upload a prediction GFF and compute a temporary preview for this browser session only."
            />
            <Typography color="text.secondary">
              Temporary submissions are computed on demand and shown only on this page for the current session. They are not written
              to persistent Space storage and are removed after refresh. For permanent inclusion, open a pull request to the permanent repository.
            </Typography>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
              {uploadFile ? uploadFile.name : "Choose prediction GFF"}
              <input
                ref={uploadInputRef}
                hidden
                type="file"
                accept=".gff,.gff3,.gtf,.txt"
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              />
            </Button>
            <Button variant="contained" onClick={submitUpload} disabled={uploadLoading}>Submit</Button>
            {uploadLoading ? (
              <Box className="score-calc-animation">
                <span className="orb" />
                <Typography color="text.secondary">Calculating score trajectories and transcript evidence…</Typography>
              </Box>
            ) : null}
            {uploadMessage ? <Alert severity="info">{uploadMessage}</Alert> : null}
            <Alert severity="info">
              Permanent repository: <span className="mono">{overview?.source_repository_url || "https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git"}</span>
            </Alert>
          </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.0}>
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
                  if (selectedKInput === "") return;
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
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
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
                    <TableCell colSpan={4} align="center">Exon</TableCell>
                    <TableCell colSpan={4} align="center">CDS</TableCell>
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
                          {row.temporary ? <Chip size="small" variant="outlined" label="temporary" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell sx={mainColumnHighlights.exon_interval_f1 !== undefined && Number(row.exon_interval_f1) === mainColumnHighlights.exon_interval_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.exon_interval_f1)}</TableCell>
                      <TableCell sx={mainColumnHighlights.exon_interval_mi !== undefined && Number(row.exon_interval_mi) === mainColumnHighlights.exon_interval_mi ? { fontWeight: 800 } : {}}>{formatScore(row.exon_interval_mi, 0)}</TableCell>
                      <TableCell className="rank-column-highlight" sx={mainColumnHighlights.exon_segmentation_f1 !== undefined && Number(row.exon_segmentation_f1) === mainColumnHighlights.exon_segmentation_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.exon_segmentation_f1)}</TableCell>
                      <TableCell sx={mainColumnHighlights.exon_segmentation_mi !== undefined && Number(row.exon_segmentation_mi) === mainColumnHighlights.exon_segmentation_mi ? { fontWeight: 800 } : {}}>{formatScore(row.exon_segmentation_mi, 0)}</TableCell>
                      <TableCell sx={mainColumnHighlights.cds_interval_f1 !== undefined && Number(row.cds_interval_f1) === mainColumnHighlights.cds_interval_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.cds_interval_f1)}</TableCell>
                      <TableCell sx={mainColumnHighlights.cds_interval_mi !== undefined && Number(row.cds_interval_mi) === mainColumnHighlights.cds_interval_mi ? { fontWeight: 800 } : {}}>{formatScore(row.cds_interval_mi, 0)}</TableCell>
                      <TableCell className="rank-column-highlight" sx={mainColumnHighlights.cds_segmentation_f1 !== undefined && Number(row.cds_segmentation_f1) === mainColumnHighlights.cds_segmentation_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.cds_segmentation_f1)}</TableCell>
                      <TableCell sx={mainColumnHighlights.cds_segmentation_mi !== undefined && Number(row.cds_segmentation_mi) === mainColumnHighlights.cds_segmentation_mi ? { fontWeight: 800 } : {}}>{formatScore(row.cds_segmentation_mi, 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.0}>
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
                  <MenuItem key={value} value={value}>{label}</MenuItem>
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
            onChange={(_, value) => setSelectedModels(value.map((item) => item.model_id))}
            renderInput={(params) => <TextField {...params} label="Models shown on the graph" />}
          />

          <Box sx={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 24, bottom: 10, left: 8 }}
                onClick={(event) => {
                  if (event && event.activeLabel !== undefined && event.activeLabel !== null) {
                    setSelectedKInput(`${Number(event.activeLabel)}`);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="k" type="number" domain={[0, 500]} allowDecimals={false} ticks={CHART_TICKS} />
                <YAxis />
                <Tooltip />
                <Legend />
                {CHART_TICKS.map((tick) => (
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
        <Stack spacing={2.0}>
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
                    <TableCell colSpan={4} align="center">Interval level</TableCell>
                    <TableCell colSpan={4} align="center">Segmentation level</TableCell>
                    <TableCell colSpan={3} align="center">Exact part level</TableCell>
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
                          {row.temporary ? <Chip size="small" variant="outlined" label="temporary" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell sx={fullColumnHighlights.interval_precision !== undefined && Number(row.interval_precision) === fullColumnHighlights.interval_precision ? { fontWeight: 800 } : {}}>{formatScore(row.interval_precision)}</TableCell>
                      <TableCell sx={fullColumnHighlights.interval_recall !== undefined && Number(row.interval_recall) === fullColumnHighlights.interval_recall ? { fontWeight: 800 } : {}}>{formatScore(row.interval_recall)}</TableCell>
                      <TableCell sx={fullColumnHighlights.interval_f1 !== undefined && Number(row.interval_f1) === fullColumnHighlights.interval_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.interval_f1)}</TableCell>
                      <TableCell sx={fullColumnHighlights.interval_mi !== undefined && Number(row.interval_mi) === fullColumnHighlights.interval_mi ? { fontWeight: 800 } : {}}>{formatScore(row.interval_mi, 0)}</TableCell>
                      <TableCell sx={fullColumnHighlights.segmentation_precision !== undefined && Number(row.segmentation_precision) === fullColumnHighlights.segmentation_precision ? { fontWeight: 800 } : {}}>{formatScore(row.segmentation_precision)}</TableCell>
                      <TableCell sx={fullColumnHighlights.segmentation_recall !== undefined && Number(row.segmentation_recall) === fullColumnHighlights.segmentation_recall ? { fontWeight: 800 } : {}}>{formatScore(row.segmentation_recall)}</TableCell>
                      <TableCell sx={fullColumnHighlights.segmentation_f1 !== undefined && Number(row.segmentation_f1) === fullColumnHighlights.segmentation_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.segmentation_f1)}</TableCell>
                      <TableCell sx={fullColumnHighlights.segmentation_mi !== undefined && Number(row.segmentation_mi) === fullColumnHighlights.segmentation_mi ? { fontWeight: 800 } : {}}>{formatScore(row.segmentation_mi, 0)}</TableCell>
                      <TableCell sx={fullColumnHighlights.part_precision !== undefined && Number(row.part_precision) === fullColumnHighlights.part_precision ? { fontWeight: 800 } : {}}>{formatScore(row.part_precision)}</TableCell>
                      <TableCell sx={fullColumnHighlights.part_recall !== undefined && Number(row.part_recall) === fullColumnHighlights.part_recall ? { fontWeight: 800 } : {}}>{formatScore(row.part_recall)}</TableCell>
                      <TableCell sx={fullColumnHighlights.part_f1 !== undefined && Number(row.part_f1) === fullColumnHighlights.part_f1 ? { fontWeight: 800 } : {}}>{formatScore(row.part_f1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.0}>
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
                <MenuItem key={model.model_id} value={model.model_id}>{model.display_name}</MenuItem>
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
                <MenuItem key={rule.value} value={rule.value}>{rule.label}</MenuItem>
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

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}><SectionTitle title="Metric curves" subtitle="Choose the branch, metric, and models to inspect smooth trajectories over k = 0…500." /><Stack direction={{ xs: "column", lg: "row" }} spacing={1.2}><BranchTabs value={graphBranch} onChange={setGraphBranch} /><TextField select label="Metric" value={graphMetric} onChange={(e) => setGraphMetric(e.target.value)} sx={{ minWidth: 240 }}>{Object.entries(METRIC_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField></Stack></Stack>
      <Autocomplete multiple options={modelsCombined} value={modelsCombined.filter((i) => selectedModels.includes(i.model_id))} disableCloseOnSelect getOptionLabel={(o) => o.display_name} onChange={(_, v) => setSelectedModels(v.map((i) => i.model_id))} renderInput={(params) => <TextField {...params} label="Models shown on the graph" />} />
      <Box sx={{ width: "100%", height: 420 }}><ResponsiveContainer><LineChart data={chartData} margin={{ top: 10, right: 24, bottom: 10, left: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" type="number" domain={[0, 500]} ticks={CHART_TICKS} allowDecimals={false} /><YAxis /><Tooltip /><Legend />{CHART_TICKS.map((tick) => <ReferenceLine key={tick} x={tick} stroke="#94a3b8" strokeDasharray="4 4" />)}<ReferenceLine x={selectedK} stroke="#334155" strokeDasharray="4 4" />{chartModels.map((model, index) => <Line key={model.model_id} dataKey={model.model_id} name={model.display_name} stroke={CHART_COLORS[index % CHART_COLORS.length]} dot={false} type="monotone" strokeWidth={2.4} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></Box>
    </Stack></Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between"><SectionTitle title="Full metrics" subtitle="Complete metric table at the active k for selected models." /><BranchTabs value={fullBranch} onChange={setFullBranch} /></Stack>
      <Box className="result-table-wrap"><Table className="metric-table"><TableHead><TableRow><TableCell>Model</TableCell><TableCell>Interval P</TableCell><TableCell>Interval R</TableCell><TableCell>Interval F1</TableCell><TableCell>Interval MI</TableCell><TableCell>Seg P</TableCell><TableCell>Seg R</TableCell><TableCell>Seg F1</TableCell><TableCell>Seg MI</TableCell><TableCell>Part P</TableCell><TableCell>Part R</TableCell><TableCell>Part F1</TableCell></TableRow></TableHead><TableBody>{(fullMetrics?.rows || []).map((row) => <TableRow key={row.model_id}><TableCell>{row.display_name}</TableCell>{["interval_precision","interval_recall","interval_f1","interval_mi","segmentation_precision","segmentation_recall","segmentation_f1","segmentation_mi","part_precision","part_recall","part_f1"].map((k) => <TableCell key={k} sx={fullHighlights[k] !== undefined && Number(row[k]) === fullHighlights[k] ? { fontWeight: 800 } : {}}>{formatScore(row[k], k.includes("_mi") ? 0 : 3)}</TableCell>)}</TableRow>)}</TableBody></Table></Box></Stack></Paper>

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
                            {gene.transcript_types.map((item) => <Chip size="small" key={`${gene.gene_id}-${item}`} label={item} />)}
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${gene.chromosome}:${gene.start}-${gene.end} (${gene.strand})`}
                            />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {gene.transcript_count} transcript{gene.transcript_count === 1 ? "" : "s"}
                          {matchedAcrossGene !== null ? ` · ${matchedAcrossGene} matched predictions across all transcripts` : ""}
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
                                      <Chip size="small" variant="outlined" label={`${transcript.matched_prediction_count} matched predictions`} />
                                      <Chip size="small" variant="outlined" label={`${transcript.chromosome}:${transcript.start}-${transcript.end}`} />
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
                                      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Ground-truth exon segments</Typography>
                                      <SegmentBox segments={transcript.exon_segments} />
                                    </Box>
                                    <Box>
                                      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Ground-truth CDS segments</Typography>
                                      <SegmentBox segments={transcript.cds_segments} />
                                    </Box>
                                  </Box>
                                  {!transcript.matched_predictions.length ? (
                                    <Alert severity="info">No selected models match this transcript at the current branch.</Alert>
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
                                            <TableCell>Matched at current k</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {transcript.matched_predictions.map((match) => (
                                            <TableRow key={`${transcript.transcript_id}-${match.model_id}-${match.pred_id}`}>
                                              <TableCell>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                  <Typography>{match.model_name}</Typography>
                                                  {match.temporary ? <Chip size="small" variant="outlined" label="temporary" /> : null}
                                                </Stack>
                                              </TableCell>
                                              <TableCell>{match.strand || "—"}</TableCell>
                                              <TableCell><ReadonlyCellField value={match.pred_id} /></TableCell>
                                              <TableCell>
                                                <ReadonlyCellField
                                                  value={match.chromosome ? `${match.chromosome}:${match.start}-${match.end}` : "—"}
                                                />
                                              </TableCell>
                                              <TableCell><SegmentBox segments={match.exon_segments} /></TableCell>
                                              <TableCell><SegmentBox segments={match.cds_segments} /></TableCell>
                                              <TableCell>{formatScore(match.min_k, 0)}</TableCell>
                                              <TableCell>
                                                <MetricChip label="match" value={match.matched_at_k ? 1 : 0} temporary={false} />
                                              </TableCell>
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
            </Stack>
          )}

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between"><SectionTitle title="Detailed information" subtitle="Transcript-level evidence and matched prediction counts per gene." /><BranchTabs value={detailBranch} onChange={(next) => { setDetailBranch(next); setGenePage(1); }} /></Stack><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2 }}><TextField fullWidth label="Search ground-truth genes, transcripts, chromosome, or type" value={geneQuery} onChange={(e) => { setGeneQuery(e.target.value); setGenePage(1); }} InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} /> }} sx={uniformFieldSx} /><TextField label="Active k" value={selectedK} disabled sx={uniformFieldSx} /></Box>
      <Stack spacing={1.1}>{geneList.items.map((gene) => { const cacheKey = `${detailBranch}|${gene.gene_id}|${selectedK}|${selectedModels.join(",")}`; const detail = geneDetails[cacheKey]; const matchedAcrossGene = detail ? detail.gene.transcripts.reduce((acc, tx) => acc + (tx.matched_prediction_count || 0), 0) : null; return <Accordion key={`${detailBranch}-${gene.gene_id}`} expanded={expandedGene === gene.gene_id} onChange={(_, isExpanded) => { setExpandedGene(isExpanded ? gene.gene_id : false); if (isExpanded) fetchGeneDetail(gene.gene_id); }}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack><Typography fontWeight={760}>{gene.gene_id}</Typography><Typography variant="body2" color="text.secondary">{gene.transcript_count} transcripts{matchedAcrossGene !== null ? ` · ${matchedAcrossGene} matched predictions across all transcripts` : ""}</Typography></Stack></AccordionSummary><AccordionDetails>{!detail ? <Stack direction="row" spacing={1}><CircularProgress size={20} /><Typography color="text.secondary">Loading transcript-level details…</Typography></Stack> : <Stack spacing={1.1}>{detail.gene.transcripts.map((transcript) => <Accordion key={transcript.transcript_id}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack><Typography fontWeight={760}>{transcript.transcript_id}</Typography><Typography variant="body2" color="text.secondary">{transcript.matched_prediction_count} matched predictions</Typography></Stack></AccordionSummary><AccordionDetails>{!transcript.matched_predictions.length ? <Alert severity="info">No selected models match this transcript at the current branch.</Alert> : <Box className="result-table-wrap"><Table className="metric-table details-table"><TableHead><TableRow><TableCell>Model</TableCell><TableCell>Strand</TableCell><TableCell>Prediction</TableCell><TableCell>Coordinate</TableCell><TableCell>Exon segments</TableCell><TableCell>CDS segments</TableCell><TableCell>Min k</TableCell></TableRow></TableHead><TableBody>{transcript.matched_predictions.map((match) => <TableRow key={`${transcript.transcript_id}-${match.model_id}-${match.pred_id}`}><TableCell>{match.model_name}</TableCell><TableCell>{match.strand || "—"}</TableCell><TableCell>{match.pred_id}</TableCell><TableCell>{match.chromosome ? `${match.chromosome}:${match.start}-${match.end}` : "—"}</TableCell><TableCell>{formatSegments(match.exon_segments)}</TableCell><TableCell>{formatSegments(match.cds_segments)}</TableCell><TableCell>{formatScore(match.min_k, 0)}</TableCell></TableRow>)}</TableBody></Table></Box>}</AccordionDetails></Accordion>)}</Stack>}</AccordionDetails></Accordion>; })}</Stack>
    </Stack></Paper>
  </Stack>;
}
