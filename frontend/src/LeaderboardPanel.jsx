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

const CHART_COLORS = ["#0f766e", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#7c3aed", "#0891b2", "#1d4ed8", "#ea580c"];
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

const DESCRIPTION_HTML = `
  <section id="leaderboard-description">
    <h2>Leaderboard description</h2>
    <p>The leaderboard is the comparative layer built on top of the metric described above. Its role is not to display a single ranking number, but to organize the metric outputs so that differences between models remain biologically interpretable. For that reason, the main table reports eight summary values: interval-level F1, interval-level MI, segmentation-level F1, and segmentation-level MI for the <strong>exon</strong> branch, and the same four quantities for the <strong>CDS</strong> branch.</p>
    <p>The graph panel then shows any selected metric as a function of the tolerance parameter \(k\). This presentation is essential, because models that appear similar at one threshold may behave very differently across the full tolerance range. A model that improves only at large \(k\) is fundamentally different from a model that is already accurate near exact matching. Therefore, the curve view reveals boundary precision, robustness, and error sensitivity more clearly than a single operating point.</p>
    <p>Once a specific value of \(k\) is selected, the <strong>Full metrics</strong> panel expands the summary into its components: matched and unmatched predictions, recovered and missed genes, MI counts, and exact exon or CDS part-level scores. In this way, a model’s position on the leaderboard can be explained rather than merely stated, since improvements can be traced to precision, recall, structural correctness, or isoform recovery.</p>
    <p>The <strong>Stratifier</strong> panel presents the same metric outputs after grouping the data by strand, chromosome, or transcript type. As a result, users can determine whether a model is uniformly strong or whether its performance is concentrated in particular biological contexts. This grouped view is especially important when global averages would otherwise conceal systematic weaknesses.</p>
    <p>The <strong>Detailed information</strong> panel provides transcript-resolved evidence for every ground-truth gene. For each reference transcript, it lists the supporting predictions, the minimum tolerance at which each support appears, and the contribution of the parent gene to multi-isoform recovery. Thus, the leaderboard remains auditable from the highest-level comparison down to individual biological objects.</p>
    <p>In addition, the leaderboard allows temporary evaluation of user-supplied GFF predictions under the same rules. These temporary entries appear alongside the permanent models during the current session, while permanent inclusion requires adding the prediction to the maintained repository. This keeps model comparison open and reproducible without turning the leaderboard itself into long-term storage for arbitrary uploads.</p>
  </section>`;

function SectionTitle({ title, subtitle }) {
  return <Stack spacing={0.6}><Typography variant="h5">{title}</Typography>{subtitle ? <Typography color="text.secondary">{subtitle}</Typography> : null}</Stack>;
}
const formatScore = (v, d = 3) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : (Number.isInteger(v) ? `${v}` : Number(v).toFixed(d)));
const formatSegments = (segments) => (!segments?.length ? "—" : segments.map(([s, e]) => `[${s}, ${e}]`).join(", "));

function BranchTabs({ value, onChange }) { return <Tabs value={value} onChange={(_, next) => onChange(next)}><Tab value="exon" label="Exon branch" /><Tab value="cds" label="CDS branch" /></Tabs>; }

function modelValueAtK(overview, model, branch, metricKey, selectedK) {
  if (!overview || !model?.curves?.[branch]?.[metricKey]) return null;
  const index = Math.max(0, Math.min(Number(selectedK) || 0, overview.k_values.length - 1));
  return model.curves[branch][metricKey][index];
}

function getColumnHighlights(rows, keys) {
  const result = {};
  keys.forEach((key) => {
    const values = rows.map((r) => Number(r[key])).filter((v) => Number.isFinite(v));
    if (!values.length) return;
    const allSame = values.every((v) => v === values[0]);
    if (allSame) return;
    result[key] = Math.max(...values);
  });
  return result;
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
    if (!overview) return;
    setSelectedKInput((current) => (current === "" ? "" : current || `${overview.default_k ?? 250}`));
    if (modelsCombined.length > 0) setSelectedModels((current) => (current.length ? current.filter((id) => modelsCombined.some((m) => m.model_id === id)) : modelsCombined.map((m) => m.model_id)));
    if (!stratModel && modelsCombined.length > 0) setStratModel(modelsCombined[0].model_id);
  }, [overview, stratModel, modelsCombined]);

  const mainRows = useMemo(() => {
    const rows = modelsCombined.map((model) => ({
      model_id: model.model_id, display_name: model.display_name, temporary: model.temporary,
      exon_interval_f1: modelValueAtK(overview, model, "exon", "interval_f1", selectedK),
      exon_interval_mi: modelValueAtK(overview, model, "exon", "interval_mi", selectedK),
      exon_segmentation_f1: modelValueAtK(overview, model, "exon", "segmentation_f1", selectedK),
      exon_segmentation_mi: modelValueAtK(overview, model, "exon", "segmentation_mi", selectedK),
      cds_interval_f1: modelValueAtK(overview, model, "cds", "interval_f1", selectedK),
      cds_interval_mi: modelValueAtK(overview, model, "cds", "interval_mi", selectedK),
      cds_segmentation_f1: modelValueAtK(overview, model, "cds", "segmentation_f1", selectedK),
      cds_segmentation_mi: modelValueAtK(overview, model, "cds", "segmentation_mi", selectedK),
    }));
    return rows.sort((a, b) => Number(b[sortMetric] ?? -Infinity) - Number(a[sortMetric] ?? -Infinity) || a.display_name.localeCompare(b.display_name));
  }, [modelsCombined, overview, selectedK, sortMetric]);

  const mainHighlights = useMemo(() => getColumnHighlights(mainRows, ["exon_interval_f1", "exon_interval_mi", "exon_segmentation_f1", "exon_segmentation_mi", "cds_interval_f1", "cds_interval_mi", "cds_segmentation_f1", "cds_segmentation_mi"]), [mainRows]);

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

  const fetchGeneDetail = async (geneId) => {
    const tempId = temporaryPreview?.model?.model_id;
    const permanentIds = selectedModels.filter((id) => id !== tempId);
    const cacheKey = `${detailBranch}|${geneId}|${selectedK}|${selectedModels.join(",")}`;
    if (geneDetails[cacheKey]) return;
    const params = new URLSearchParams({ branch: detailBranch, k: `${selectedK}` });
    if (permanentIds.length) params.set("model_ids", permanentIds.join(","));
    const payload = await (await fetch(`/api/leaderboard/gene/${encodeURIComponent(geneId)}?${params.toString()}`)).json();
    if (temporaryPreview && selectedModels.includes(tempId)) {
      payload.gene.transcripts = payload.gene.transcripts.map((tx) => {
        const local = temporaryPreview.detailed?.[detailBranch]?.[tx.transcript_id];
        if (!local) return tx;
        const intervalMap = Object.fromEntries((local["interval-level"]?.predictions || []).filter((i) => i.min_k !== null && i.min_k !== undefined).map((i) => [i.pred_id, Number(i.min_k)]));
        const segMap = Object.fromEntries((local["segmentation-level"]?.predictions || []).filter((i) => i.min_k !== null && i.min_k !== undefined).map((i) => [i.pred_id, Number(i.min_k)]));
        const add = [...new Set([...Object.keys(intervalMap), ...Object.keys(segMap)])].map((predId) => {
          const pred = temporaryPreview.prediction_index?.[predId] || {};
          const minK = Math.min(...[intervalMap[predId], segMap[predId]].filter((v) => Number.isFinite(v)));
          return { model_id: tempId, model_name: temporaryPreview.model.display_name, temporary: true, pred_id: predId, chromosome: pred.chromosome, start: pred.start, end: pred.end, strand: pred.strand, exon_segments: pred.exon_segments || [], cds_segments: pred.cds_segments || [], min_k: Number.isFinite(minK) ? minK : null, matched_at_k: Number.isFinite(minK) ? minK <= selectedK : false };
        });
        return { ...tx, matched_predictions: [...tx.matched_predictions, ...add], matched_prediction_count: tx.matched_predictions.length + add.length };
      });
    }
    setGeneDetails((current) => ({ ...current, [cacheKey]: payload }));
  };

  const submitPreview = async () => {
    setUploadMessage("");
    if (!uploadFile) return setUploadMessage("Please choose a prediction GFF file.");
    setUploadLoading(true);
    try {
      const response = await fetch("/api/leaderboard/temporary-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model_name: "Temporary preview", pred_gff_text: await uploadFile.text() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Submission failed");
      setTemporaryPreview(payload);
      setUploadMessage("Temporary preview calculated. It exists only in this browser session and disappears after refresh.");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      setUploadFile(null);
      setGeneDetails({});
    } catch (error) {
      setUploadMessage(error.message || "Submission failed.");
    } finally {
      setUploadLoading(false);
    }
  };

  const chartModels = useMemo(() => modelsCombined.filter((m) => selectedModels.includes(m.model_id)), [modelsCombined, selectedModels]);
  const chartData = useMemo(() => !overview?.k_values ? [] : overview.k_values.map((k, idx) => Object.fromEntries([["k", k], ...chartModels.map((model) => [model.model_id, model.curves?.[graphBranch]?.[graphMetric]?.[idx] ?? null])])), [overview, chartModels, graphBranch, graphMetric]);

  return <Stack spacing={3.2}>
    <Paper className="glass-card hero-card" sx={{ p: { xs: 2.4, md: 3.4 } }}>
      <Stack spacing={2}><SectionTitle title="Leaderboard description" subtitle="Scientifically interpretable comparison of ab initio annotation models." /><Box className="metric-description" dangerouslySetInnerHTML={{ __html: DESCRIPTION_HTML }} />{status?.error ? <Alert severity="error">{status.error}</Alert> : null}</Stack>
    </Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}>
      <Stack spacing={1.8}>
        <SectionTitle title="Temporary custom submission" subtitle="Submit a prediction GFF for an on-page preview. The preview is not stored on the Space and is removed after page refresh." />
        <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>{uploadFile ? uploadFile.name : "Choose prediction GFF"}<input ref={uploadInputRef} hidden type="file" accept=".gff,.gff3,.gtf,.txt" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} /></Button>
        <Button variant="contained" onClick={submitPreview} disabled={uploadLoading}>Submit</Button>
        {uploadLoading ? <Box className="score-calc-animation"><span className="orb" /><Typography>Calculating score trajectories and transcript evidence…</Typography></Box> : null}
        {uploadMessage ? <Alert severity="info">{uploadMessage}</Alert> : null}
        <Alert severity="info">Permanent repository: <span className="mono">{overview?.source_repository_url || "https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git"}</span>. Open a pull request there for permanent inclusion.</Alert>
      </Stack>
    </Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}><SectionTitle title="Main metrics" subtitle="The table is evaluated at a user-selected tolerance k and shows both exon and CDS branches simultaneously." /><Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}><TextField label="Active k" type="number" value={selectedKInput} onChange={(e) => setSelectedKInput(e.target.value)} inputProps={{ min: 0, max: 500 }} sx={{ width: 120, ...uniformFieldSx }} /><TextField select label="Sort rows" value={sortMetric} onChange={(e) => setSortMetric(e.target.value)} sx={{ minWidth: 320, ...uniformFieldSx }}>{SORT_METRICS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</TextField></Stack></Stack>
    <Box className="result-table-wrap"><Table className="metric-table main-metrics-table"><TableHead><TableRow><TableCell rowSpan={2}>Rank</TableCell><TableCell rowSpan={2}>Model</TableCell><TableCell colSpan={4} align="center">Exon</TableCell><TableCell colSpan={4} align="center">CDS</TableCell></TableRow><TableRow><TableCell>F1 w/o seg.</TableCell><TableCell>MI w/o seg.</TableCell><TableCell className="rank-column-highlight">F1 with seg.</TableCell><TableCell>MI with seg.</TableCell><TableCell>F1 w/o seg.</TableCell><TableCell>MI w/o seg.</TableCell><TableCell className="rank-column-highlight">F1 with seg.</TableCell><TableCell>MI with seg.</TableCell></TableRow></TableHead><TableBody>{mainRows.map((row, index) => <TableRow key={row.model_id}><TableCell>{index + 1}</TableCell><TableCell><Stack direction="row" spacing={1}><Typography fontWeight={760}>{row.display_name}</Typography>{row.temporary ? <Chip size="small" variant="outlined" label="temporary" /> : null}</Stack></TableCell>{["exon_interval_f1","exon_interval_mi","exon_segmentation_f1","exon_segmentation_mi","cds_interval_f1","cds_interval_mi","cds_segmentation_f1","cds_segmentation_mi"].map((key) => <TableCell key={key} className={key.includes("segmentation_f1") ? "rank-column-highlight" : ""} sx={mainHighlights[key] !== undefined && Number(row[key]) === mainHighlights[key] ? { fontWeight: 800 } : {}}>{formatScore(row[key], key.includes("_mi") ? 0 : 3)}</TableCell>)}</TableRow>)}</TableBody></Table></Box></Stack></Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}><SectionTitle title="Metric curves" subtitle="Choose the branch, metric, and models to inspect smooth trajectories over k = 0…500." /><Stack direction={{ xs: "column", lg: "row" }} spacing={1.2}><BranchTabs value={graphBranch} onChange={setGraphBranch} /><TextField select label="Metric" value={graphMetric} onChange={(e) => setGraphMetric(e.target.value)} sx={{ minWidth: 240 }}>{Object.entries(METRIC_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField></Stack></Stack>
      <Autocomplete multiple options={modelsCombined} value={modelsCombined.filter((i) => selectedModels.includes(i.model_id))} disableCloseOnSelect getOptionLabel={(o) => o.display_name} onChange={(_, v) => setSelectedModels(v.map((i) => i.model_id))} renderInput={(params) => <TextField {...params} label="Models shown on the graph" />} />
      <Box sx={{ width: "100%", height: 420 }}><ResponsiveContainer><LineChart data={chartData} margin={{ top: 10, right: 24, bottom: 10, left: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" type="number" domain={[0, 500]} ticks={CHART_TICKS} allowDecimals={false} /><YAxis /><Tooltip /><Legend />{CHART_TICKS.map((tick) => <ReferenceLine key={tick} x={tick} stroke="#94a3b8" strokeDasharray="4 4" />)}<ReferenceLine x={selectedK} stroke="#334155" strokeDasharray="4 4" />{chartModels.map((model, index) => <Line key={model.model_id} dataKey={model.model_id} name={model.display_name} stroke={CHART_COLORS[index % CHART_COLORS.length]} dot={false} type="monotone" strokeWidth={2.4} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></Box>
    </Stack></Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between"><SectionTitle title="Full metrics" subtitle="Complete metric table at the active k for selected models." /><BranchTabs value={fullBranch} onChange={setFullBranch} /></Stack>
      <Box className="result-table-wrap"><Table className="metric-table"><TableHead><TableRow><TableCell>Model</TableCell><TableCell>Interval P</TableCell><TableCell>Interval R</TableCell><TableCell>Interval F1</TableCell><TableCell>Interval MI</TableCell><TableCell>Seg P</TableCell><TableCell>Seg R</TableCell><TableCell>Seg F1</TableCell><TableCell>Seg MI</TableCell><TableCell>Part P</TableCell><TableCell>Part R</TableCell><TableCell>Part F1</TableCell></TableRow></TableHead><TableBody>{(fullMetrics?.rows || []).map((row) => <TableRow key={row.model_id}><TableCell>{row.display_name}</TableCell>{["interval_precision","interval_recall","interval_f1","interval_mi","segmentation_precision","segmentation_recall","segmentation_f1","segmentation_mi","part_precision","part_recall","part_f1"].map((k) => <TableCell key={k} sx={fullHighlights[k] !== undefined && Number(row[k]) === fullHighlights[k] ? { fontWeight: 800 } : {}}>{formatScore(row[k], k.includes("_mi") ? 0 : 3)}</TableCell>)}</TableRow>)}</TableBody></Table></Box></Stack></Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between"><SectionTitle title="Stratifier" subtitle="Grouped metrics by strand, chromosome, or transcript type." /><BranchTabs value={stratBranch} onChange={setStratBranch} /></Stack><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2 }}><TextField select label="Model" value={stratModel} onChange={(e) => setStratModel(e.target.value)}>{modelsCombined.map((m) => <MenuItem key={m.model_id} value={m.model_id}>{m.display_name}</MenuItem>)}</TextField><TextField select label="Rule" value={stratRule} onChange={(e) => setStratRule(e.target.value)}>{(overview?.available_stratifiers || []).map((rule) => <MenuItem key={rule.value} value={rule.value}>{rule.label}</MenuItem>)}</TextField><TextField label="Active k" value={selectedK} disabled /></Box></Stack></Paper>

    <Paper className="glass-card" sx={{ p: { xs: 2.2, md: 3 } }}><Stack spacing={2}><Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between"><SectionTitle title="Detailed information" subtitle="Transcript-level evidence and matched prediction counts per gene." /><BranchTabs value={detailBranch} onChange={(next) => { setDetailBranch(next); setGenePage(1); }} /></Stack><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2 }}><TextField fullWidth label="Search ground-truth genes, transcripts, chromosome, or type" value={geneQuery} onChange={(e) => { setGeneQuery(e.target.value); setGenePage(1); }} InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} /> }} sx={uniformFieldSx} /><TextField label="Active k" value={selectedK} disabled sx={uniformFieldSx} /></Box>
      <Stack spacing={1.1}>{geneList.items.map((gene) => { const cacheKey = `${detailBranch}|${gene.gene_id}|${selectedK}|${selectedModels.join(",")}`; const detail = geneDetails[cacheKey]; const matchedAcrossGene = detail ? detail.gene.transcripts.reduce((acc, tx) => acc + (tx.matched_prediction_count || 0), 0) : null; return <Accordion key={`${detailBranch}-${gene.gene_id}`} expanded={expandedGene === gene.gene_id} onChange={(_, isExpanded) => { setExpandedGene(isExpanded ? gene.gene_id : false); if (isExpanded) fetchGeneDetail(gene.gene_id); }}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack><Typography fontWeight={760}>{gene.gene_id}</Typography><Typography variant="body2" color="text.secondary">{gene.transcript_count} transcripts{matchedAcrossGene !== null ? ` · ${matchedAcrossGene} matched predictions across all transcripts` : ""}</Typography></Stack></AccordionSummary><AccordionDetails>{!detail ? <Stack direction="row" spacing={1}><CircularProgress size={20} /><Typography color="text.secondary">Loading transcript-level details…</Typography></Stack> : <Stack spacing={1.1}>{detail.gene.transcripts.map((transcript) => <Accordion key={transcript.transcript_id}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack><Typography fontWeight={760}>{transcript.transcript_id}</Typography><Typography variant="body2" color="text.secondary">{transcript.matched_prediction_count} matched predictions</Typography></Stack></AccordionSummary><AccordionDetails>{!transcript.matched_predictions.length ? <Alert severity="info">No selected models match this transcript at the current branch.</Alert> : <Box className="result-table-wrap"><Table className="metric-table details-table"><TableHead><TableRow><TableCell>Model</TableCell><TableCell>Strand</TableCell><TableCell>Prediction</TableCell><TableCell>Coordinate</TableCell><TableCell>Exon segments</TableCell><TableCell>CDS segments</TableCell><TableCell>Min k</TableCell></TableRow></TableHead><TableBody>{transcript.matched_predictions.map((match) => <TableRow key={`${transcript.transcript_id}-${match.model_id}-${match.pred_id}`}><TableCell>{match.model_name}</TableCell><TableCell>{match.strand || "—"}</TableCell><TableCell>{match.pred_id}</TableCell><TableCell>{match.chromosome ? `${match.chromosome}:${match.start}-${match.end}` : "—"}</TableCell><TableCell>{formatSegments(match.exon_segments)}</TableCell><TableCell>{formatSegments(match.cds_segments)}</TableCell><TableCell>{formatScore(match.min_k, 0)}</TableCell></TableRow>)}</TableBody></Table></Box>}</AccordionDetails></Accordion>)}</Stack>}</AccordionDetails></Accordion>; })}</Stack>
    </Stack></Paper>
  </Stack>;
}
