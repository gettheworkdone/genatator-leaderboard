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
  Grid,
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
import RefreshIcon from "@mui/icons-material/Refresh";
import InsightsIcon from "@mui/icons-material/Insights";
import FunctionsIcon from "@mui/icons-material/Functions";
import DatasetLinkedIcon from "@mui/icons-material/DatasetLinked";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import SearchIcon from "@mui/icons-material/Search";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import BiotechIcon from "@mui/icons-material/Biotech";
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


function modelValueAtK(overview, model, branch, metricKey, selectedK) {
  if (!overview || !model?.curves?.[branch]?.[metricKey]) {
    return null;
  }
  const index = Math.max(0, Math.min(Number(selectedK) || 0, overview.k_values.length - 1));
  return model.curves[branch][metricKey][index];
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
  const [uploadModelName, setUploadModelName] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const uploadInputRef = useRef(null);
  const selectedK = useMemo(() => {
    const parsed = Number(selectedKInput);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(parsed, 500));
  }, [selectedKInput]);

  const fetchStatus = async () => {
    const response = await fetch("/api/leaderboard/status");
    const payload = await response.json();
    setStatus(payload);
  };

  const fetchOverview = async () => {
    const response = await fetch("/api/leaderboard/overview");
    const payload = await response.json();
    setOverview(payload);
  };

  useEffect(() => {
    fetchStatus();
    fetchOverview();
    const id = window.setInterval(() => {
      fetchStatus();
      fetchOverview();
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!overview) {
      return;
    }
    setSelectedKInput((current) => (current === "" ? "" : current || `${overview.default_k ?? 250}`));
    if (overview.models?.length > 0) {
      setSelectedModels((current) => {
        const allIds = overview.models.map((item) => item.model_id);
        if (!current.length) {
          return allIds;
        }
        const missing = allIds.filter((item) => !current.includes(item));
        return missing.length ? [...current, ...missing] : current;
      });
    }
    if (!stratModel && overview.models?.length > 0) {
      setStratModel(overview.models[0].model_id);
    }
  }, [overview, stratModel]);

  useEffect(() => {
    if (!overview || !overview.models?.length) {
      setFullMetrics(null);
      return;
    }
    const params = new URLSearchParams({
      branch: fullBranch,
      k: `${selectedK}`,
    });
    if (selectedModels.length > 0) {
      params.set("model_ids", selectedModels.join(","));
    }
    fetch(`/api/leaderboard/full-metrics?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setFullMetrics(payload))
      .catch(() => setFullMetrics(null));
  }, [overview, fullBranch, selectedK, selectedModels]);

  useEffect(() => {
    if (!stratModel) {
      setStratifier(null);
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
  }, [stratModel, stratBranch, stratRule, selectedK]);

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
    if (!overview?.models) {
      return [];
    }
    const rows = overview.models.map((model) => ({
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
  }, [overview, selectedK, sortMetric]);

  const chartModels = useMemo(() => {
    if (!overview?.models) {
      return [];
    }
    if (!selectedModels.length) {
      return overview.models;
    }
    return overview.models.filter((item) => selectedModels.includes(item.model_id));
  }, [overview, selectedModels]);

  const chartData = useMemo(() => {
    if (!overview?.k_values || !chartModels.length) {
      return [];
    }
    return overview.k_values.map((k, idx) => {
      const row = { k };
      for (const model of chartModels) {
        row[model.model_id] = model.curves?.[graphBranch]?.[graphMetric]?.[idx] ?? null;
      }
      return row;
    });
  }, [overview, chartModels, graphBranch, graphMetric]);

  const fetchGeneDetail = async (geneId) => {
    const cacheKey = `${detailBranch}|${geneId}|${selectedK}|${selectedModels.join(",")}`;
    if (geneDetails[cacheKey]) {
      return;
    }
    const params = new URLSearchParams({
      branch: detailBranch,
      k: `${selectedK}`,
    });
    if (selectedModels.length > 0) {
      params.set("model_ids", selectedModels.join(","));
    }
    const response = await fetch(`/api/leaderboard/gene/${encodeURIComponent(geneId)}?${params.toString()}`);
    const payload = await response.json();
    setGeneDetails((current) => ({ ...current, [cacheKey]: payload }));
  };

  const reloadLeaderboard = async () => {
    await fetch("/api/leaderboard/reload", { method: "POST" });
    fetchStatus();
    fetchOverview();
  };

  const submitUpload = async () => {
    setUploadMessage("");
    if (!uploadFile) {
      setUploadMessage("Please choose a prediction GFF file.");
      return;
    }
    const pred_gff_text = await uploadFile.text();
    const response = await fetch("/api/leaderboard/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name: uploadModelName,
        pred_gff_text,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setUploadMessage(payload.detail || "Upload failed.");
      return;
    }
    setUploadMessage(payload.message || "Temporary model submitted.");
    setUploadModelName("");
    setUploadFile(null);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  };

  const showProgress = status?.running || status?.upload_current;
  const progressValue = useMemo(() => {
    if (!status?.total_models) {
      return 0;
    }
    return Math.round(((status.completed_models || 0) / status.total_models) * 100);
  }, [status]);

  return (
    <Stack spacing={3.2}>
      <Paper className="glass-card hero-card" sx={{ p: { xs: 2.4, md: 3.4 } }}>
        <Stack spacing={2.0}>
          <SectionTitle
            icon={<LeaderboardIcon color="primary" />}
            title="Leaderboard description"
            subtitle="Scientifically interpretable comparison of ab initio annotation models."
          />
          <Typography color="text.secondary">
            The leaderboard is designed not as a popularity table, but as a <strong>scientifically interpretable comparison framework</strong>.
            Its main panel reports eight primary summary scores: interval-level F1, interval-level MI, segmentation-level F1, and
            segmentation-level MI for the exon branch, and the same four metrics for the CDS branch. Together, these scores distinguish
            four different aspects of performance: broad transcript recovery, recovery of isoform diversity, biologically correct internal
            reconstruction, and coding-structure fidelity. This prevents a model from appearing strong on the basis of a single favorable
            metric while failing in another biologically essential dimension.
          </Typography>
          <Typography color="text.secondary">
            The leaderboard does not rely on a single operating point alone. Instead, it visualizes each selected metric as a{" "}
            <strong>continuous function of the tolerance parameter (k)</strong>. This presentation is scientifically important, because
            it exposes how rapidly model quality changes as one moves from exact matching toward more permissive matching. A model whose
            curve rises only under large tolerances is fundamentally different from a model that performs well near exact matching, even
            if both happen to share a similar score at one chosen value of (k). The curve view therefore captures robustness, boundary
            precision, and error sensitivity in a way that a single scalar cannot.
          </Typography>
          <Typography color="text.secondary">
            Once a specific tolerance is selected, the leaderboard expands into a <strong>full metrics view</strong>, where the aggregate
            scores are decomposed into their biological components: matched and unmatched predictions, recovered and missed genes, part-level
            exact scores, and multi-isoform counts. This makes the comparison transparent. Users can see whether a model achieves a favorable
            F1 by high precision, by high recall, or by a particular balance between the two. They can also determine whether performance
            differences arise from transcript localization, from segmentation fidelity, or from isoform recovery. In this sense, the leaderboard
            is intended not merely to rank models, but to explain ranking.
          </Typography>
          <Typography color="text.secondary">
            The stratified and transcript-resolved sections extend this philosophy further. A model may rank well overall while failing
            systematically on lncRNAs, on one strand, or on particular chromosomes. Likewise, an aggregate metric may hide whether errors
            are concentrated in a small subset of difficult genes or are distributed broadly across the annotation. By placing gene- and
            transcript-level evidence directly under the global comparison, the leaderboard preserves scientific traceability from summary
            score to underlying annotation event. This is especially important for genome annotation, where the central question is not only
            which model scores highest, but <strong>what kinds of biological structures each model can and cannot recover</strong>.
          </Typography>
          <Typography color="text.secondary">
            In summary, the metric and leaderboard are built around a single principle: <strong>biological validity should take precedence
            over superficial agreement</strong>. The exon branch evaluates transcript reconstruction across coding and non-coding genes.
            The CDS branch focuses on preservation of coding structure. Interval-level scores measure localization, segmentation-level
            scores measure structural correctness, MI measures isoform recovery, part-level metrics diagnose local element detection, and
            stratified plus transcript-resolved views expose where and why models succeed or fail. Taken together, this framework provides
            a more faithful assessment of ab initio annotation quality than conventional per-base evaluation and is intended to serve as a
            rigorous benchmark for the next generation of genome annotation models.
          </Typography>
          {showProgress ? (
            <Stack spacing={1.1}>
              <LinearProgress variant={status?.total_models ? "determinate" : "indeterminate"} value={progressValue} />
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
              icon={<UploadFileIcon color="primary" />}
              title="Temporary custom submission"
              subtitle="Upload a prediction GFF and a model name to embed a temporary result across all leaderboard panels."
            />
            <Typography color="text.secondary">
              Temporary submissions are processed in memory only. They are not written to persistent Space storage and disappear
              after restart. To consolidate a model permanently on the public leaderboard, open a pull request to the repository used
              for bundled prediction files.
            </Typography>
            <TextField
              label="Model name"
              value={uploadModelName}
              onChange={(event) => setUploadModelName(event.target.value)}
              fullWidth
            />
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" onClick={submitUpload}>Submit temporary model</Button>
              <Button variant="outlined" onClick={reloadLeaderboard} startIcon={<RefreshIcon />}>Reload bundled models</Button>
            </Stack>
            {uploadMessage ? <Alert severity="info">{uploadMessage}</Alert> : null}
            <Alert severity="info">
              Permanent repository: <span className="mono">{overview?.source_repository_url || "https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions"}</span>
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
              icon={<FunctionsIcon color="primary" />}
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
                sx={{ width: 120 }}
              />
              <TextField
                select
                label="Sort rows"
                value={sortMetric}
                onChange={(event) => setSortMetric(event.target.value)}
                sx={{ minWidth: 320 }}
              >
                {SORT_METRICS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>

          {!overview?.models?.length ? (
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
                    <TableCell>F1 with seg.</TableCell>
                    <TableCell>MI with seg.</TableCell>
                    <TableCell>F1 w/o seg.</TableCell>
                    <TableCell>MI w/o seg.</TableCell>
                    <TableCell>F1 with seg.</TableCell>
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
                      <TableCell>{formatScore(row.exon_interval_f1)}</TableCell>
                      <TableCell>{formatScore(row.exon_interval_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.exon_segmentation_f1)}</TableCell>
                      <TableCell>{formatScore(row.exon_segmentation_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.cds_interval_f1)}</TableCell>
                      <TableCell>{formatScore(row.cds_interval_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.cds_segmentation_f1)}</TableCell>
                      <TableCell>{formatScore(row.cds_segmentation_mi, 0)}</TableCell>
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
              icon={<InsightsIcon color="primary" />}
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
            options={overview?.models || []}
            value={(overview?.models || []).filter((item) => selectedModels.includes(item.model_id))}
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
                <XAxis dataKey="k" type="number" domain={[0, 500]} allowDecimals={false} />
                <YAxis />
                <Tooltip />
                <Legend />
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
              icon={<DatasetLinkedIcon color="primary" />}
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
                      <TableCell>{formatScore(row.interval_precision)}</TableCell>
                      <TableCell>{formatScore(row.interval_recall)}</TableCell>
                      <TableCell>{formatScore(row.interval_f1)}</TableCell>
                      <TableCell>{formatScore(row.interval_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.segmentation_precision)}</TableCell>
                      <TableCell>{formatScore(row.segmentation_recall)}</TableCell>
                      <TableCell>{formatScore(row.segmentation_f1)}</TableCell>
                      <TableCell>{formatScore(row.segmentation_mi, 0)}</TableCell>
                      <TableCell>{formatScore(row.part_precision)}</TableCell>
                      <TableCell>{formatScore(row.part_recall)}</TableCell>
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
        <Stack spacing={2.0}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              icon={<ManageSearchIcon color="primary" />}
              title="Stratifier"
              subtitle="Select a model and a biologically meaningful grouping rule to inspect branch-specific behaviour within subsets of the benchmark."
            />
            <BranchTabs value={stratBranch} onChange={setStratBranch} />
          </Stack>
          <Grid container spacing={2}>
            <Grid item xs={12} md={5}>
              <TextField
                select
                label="Model"
                fullWidth
                value={stratModel}
                onChange={(event) => setStratModel(event.target.value)}
              >
                {(overview?.models || []).map((model) => (
                  <MenuItem key={model.model_id} value={model.model_id}>{model.display_name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Rule"
                fullWidth
                value={stratRule}
                onChange={(event) => setStratRule(event.target.value)}
              >
                {(overview?.available_stratifiers || []).map((rule) => (
                  <MenuItem key={rule.value} value={rule.value}>{rule.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Active k" value={selectedK} fullWidth disabled />
            </Grid>
          </Grid>
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
        <Stack spacing={2.0}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              icon={<BiotechIcon color="primary" />}
              title="Detailed information"
              subtitle="Ground-truth genes are listed first. Expanding a gene reveals its transcripts, and expanding a transcript reveals the matched predictions from the selected models."
            />
            <BranchTabs value={detailBranch} onChange={(next) => { setDetailBranch(next); setGenePage(1); setExpandedGene(false); }} />
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="Search ground-truth genes, transcripts, chromosome, or type"
                value={geneQuery}
                onChange={(event) => { setGeneQuery(event.target.value); setGenePage(1); }}
                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} /> }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Active k" value={selectedK} fullWidth disabled />
            </Grid>
          </Grid>

          {geneList.items?.length === 0 ? (
            <Alert severity="info">No ground-truth genes match the current filter.</Alert>
          ) : (
            <Stack spacing={1.1}>
              {geneList.items.map((gene) => {
                const cacheKey = `${detailBranch}|${gene.gene_id}|${selectedK}|${selectedModels.join(",")}`;
                const detail = geneDetails[cacheKey];
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
                                      <Chip
                                        size="small"
                                        variant="outlined"
                                        label={`${transcript.chromosome}:${transcript.start}-${transcript.end} (${transcript.strand})`}
                                      />
                                  </Stack>
                                </Stack>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Stack spacing={1.2}>
                                  <Grid container spacing={2}>
                                    <Grid item xs={12} lg={6}>
                                      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Ground-truth exon segments</Typography>
                                      <SegmentBox segments={transcript.exon_segments} />
                                    </Grid>
                                    <Grid item xs={12} lg={6}>
                                      <Typography variant="subtitle2" sx={{ mb: 0.4 }}>Ground-truth CDS segments</Typography>
                                      <SegmentBox segments={transcript.cds_segments} />
                                    </Grid>
                                  </Grid>
                                  {!transcript.matched_predictions.length ? (
                                    <Alert severity="info">No selected models match this transcript at the current branch.</Alert>
                                  ) : (
                                    <Box className="result-table-wrap">
                                      <Table className="metric-table details-table">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Model</TableCell>
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
                                              <TableCell><ReadonlyCellField value={match.pred_id} /></TableCell>
                                              <TableCell>
                                                <ReadonlyCellField
                                                  value={match.chromosome ? `${match.chromosome}:${match.start}-${match.end} (${match.strand})` : "—"}
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

          {geneList.total > geneList.page_size ? (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }} justifyContent="space-between">
              <Typography color="text.secondary">
                Showing {Math.min((geneList.page - 1) * geneList.page_size + 1, geneList.total)}–{Math.min(geneList.page * geneList.page_size, geneList.total)} of {geneList.total} genes
              </Typography>
              <Stack direction="row" spacing={1.0}>
                <Button variant="outlined" disabled={geneList.page <= 1} onClick={() => setGenePage((current) => Math.max(1, current - 1))}>Previous</Button>
                <Button variant="outlined" disabled={geneList.page * geneList.page_size >= geneList.total} onClick={() => setGenePage((current) => current + 1)}>Next</Button>
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
