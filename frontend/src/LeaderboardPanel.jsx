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
  Checkbox,
  CircularProgress,
  FormControlLabel,
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

const LEADERBOARD_DESCRIPTION_HTML = String.raw`
<section id="leaderboard-description">
  <p>
    This leaderboard compares annotation models on human chromosome 20 (NC_060944.1) from the T2T
    genome assembly GCF_009914755.1. The evaluation is restricted to mRNA and lncRNA genes and measures
    how well each model recovers the transcripts of the evaluated genes. All files required for the leaderboard
    evaluation are included in this repository. The page is organized from a compact summary to more detailed
    biological context, so you can first compare models quickly and then inspect where the differences come from.
  </p>

  <p>
    The first panel, <strong>Main metrics</strong>, gives the fastest overview. You can specify the active tolerance
    <strong>k</strong>, and all metrics across the leaderboard are updated to that same value. Here, <strong>k</strong>
    is the allowed deviation, in base pairs, between predicted and reference transcript boundaries. In this context,
    transcript start means the first transcribed nucleotide, and transcript end means the last transcribed nucleotide.
    These positions are biologically less sharply defined than splice sites because transcription initiation and
    termination can vary across molecules, while annotations represent them as fixed coordinates. Therefore,
    smaller k values require more precise transcript boundary recovery, while larger k values allow more tolerant
    matching.
  </p>

  <p>
    The Main metrics table shows the <strong>exon</strong> and <strong>CDS</strong> branches side by side. The exon
    branch measures recovery of transcript structure for mRNA and lncRNA genes. For mRNA transcripts, this
    includes UTR exons as well as coding exons. The CDS branch focuses only on the coding sequence structure
    of mRNA transcripts. In other words, the exon side tells you how well a model recovers the full transcribed
    exon structure, while the CDS side tells you how well it recovers the protein-coding structure.
  </p>

  <p>
    Under each branch, <strong>F1 w/o seg.</strong> is the interval-level F1 score before checking internal exon or
    CDS structure. Conceptually, this is similar to comparing BED-like intervals that contain only transcript
    starts and ends. It asks whether the predicted transcript or coding interval is placed in the right genomic
    region, without asking whether the internal exon or CDS chain is correct. <strong>MI w/o seg.</strong> is the
    corresponding multi-isoform count at this interval level. <strong>F1 with seg.</strong> is stricter. After a
    prediction is matched by interval, it must also pass the segmentation check. This score asks whether the model
    not only found the right region, but also reconstructed the relevant exon or CDS structure.
    <strong>MI with seg.</strong> is the multi-isoform count after the same structural check. You can also use
    <strong>Sort rows</strong> to rank models by the metric you care about most.
  </p>
  <p>
    The <strong>Annotated genes</strong> metric summarizes how many reference genes are recovered according to the
    biologically meaningful annotation rules used by both branches of the evaluation. While the exon and CDS branch
    metrics are reported separately, this metric combines them into a single gene-level recovery view that reflects
    how different transcript classes should be judged. The motivation is that mRNA and lncRNA annotations have
    different biological requirements: mRNA transcripts must be evaluated using both their transcribed exon structure
    and their coding sequence structure, while lncRNA transcripts have no CDS and are therefore evaluated through
    exon structure only. For mRNA genes at a specified value of <strong>k</strong>, the metric is implemented as the
    intersection of genes recovered at the exon segmentation level and genes recovered at the CDS segmentation level,
    so a gene is counted only when both structural requirements are satisfied.
  </p>


  <p>
    The <strong>Use strand</strong> option controls whether strand information is used during matching. When it is
    enabled, a prediction must match the reference on the same chromosome, coordinates, and strand. This is the
    strictest setting for models that report strand. When it is disabled, strand is ignored during matching. This is
    useful for models that do not return strand information in their predictions, such as SegmentNT or NTv3,
    because otherwise they would be penalized for information they never provide.
  </p>

  <p>
    The next panel, <strong>Metric curves</strong>, shows how a selected metric changes across different values of
    <strong>k</strong>. This is useful because two models can look similar at one tolerance but behave very differently
    across the full range. A model that performs well at small k values makes precise boundary predictions.
    A model that improves only at larger k values may still find approximately correct regions, but with less
    accurate boundaries. You can move your mouse over the curves to inspect values at different tolerances, and
    you can click on the curve to automatically select the k value that should be used by all other tables across
    the leaderboard.
  </p>

  <p>
    The <strong>Full metrics</strong> panel expands the selected k value into a more complete table. The branch tabs
    switch between exon and CDS results. The <strong>Interval level</strong> block reports precision, recall, F1, and
    MI before the segmentation check. Precision is calculated over predicted transcripts. It tells you what fraction
    of transcript predictions are matched to the reference. Recall is calculated over reference genes. It tells you
    what fraction of annotated genes are recovered by at least one matched transcript. F1 summarizes the balance
    between transcript-level precision and gene-level recall. MI reports how many multi-isoform genes are recovered.
    The <strong>Segmentation level</strong> block reports the same metrics after requiring correct internal exon or CDS
    structure. The <strong>Exact part level</strong> block takes the set of exon intervals in the exon branch, or the set
    of CDS intervals in the CDS branch, separately from predictions and ground truth. It then calculates precision,
    recall, and F1 from exact interval matches. A more detailed definition of this part-level calculation is provided
    in the metric description section.
  </p>

  <p>
    The <strong>Stratifier</strong> panel helps you find out where a model may perform better or worse inside the
    evaluated annotation. You choose a model, a branch, a k value, and a grouping rule such as transcript type,
    strand, or chromosome. The same metrics from the main and full tables are then recalculated separately inside
    each selected group. This makes it easier to see whether an overall score is stable across biological categories
    or whether it is driven mainly by particular subsets, such as mRNA genes, lncRNA genes, forward-strand
    transcripts, reverse-strand transcripts, or a specific chromosome group.
  </p>

  <p>
    The <strong>Detailed information</strong> panel lets you inspect recovery at the level of individual ground-truth
    genes and transcripts. It starts with the reference gene list. After opening a gene, you can inspect its annotated
    transcripts and their basic attributes. After opening a transcript, you can see which predictions from each model
    matched that ground-truth transcript and the smallest k value at which each match appears. This panel is useful
    when you want to check which model recovered a particular transcript, compare matched predictions for the same
    reference object, or understand a specific biological example beyond the aggregate scores.
  </p>

  <p>
    The final panel, <strong>Benchmark your own annotation</strong>, lets you upload your own prediction GFF and assign it a
    model name for the current session. The uploaded prediction is evaluated on demand and appears together with
    the other models in the tables and curves. It is not stored permanently and disappears after page refresh. To add
    a model to the leaderboard permanently, you have to open a pull request with your predictions and model name
    to the provided GitHub repository.
  </p>
</section>
`;

function SectionTitle({ icon = null, title, subtitle = null, constrainSubtitle = true }) {
  return (
    <Stack spacing={0.6}>
      <Stack direction="row" spacing={1} alignItems="center">
        {icon}
        <Typography variant="h5">{title}</Typography>
      </Stack>
      {subtitle ? <Typography color="text.secondary" sx={{ fontSize: "0.8rem", lineHeight: 1.45, maxWidth: constrainSubtitle ? { xs: "100%", md: "105%" } : "none" }}>{subtitle}</Typography> : null}
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
  if (!overview || !model?.curves?.[branch]?.[metricKey]) return null;
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
  const [useStrand, setUseStrand] = useState(true);

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

  const highlightedMainSortColumn = useMemo(() => sortMetric, [sortMetric]);

  const [geneQuery, setGeneQuery] = useState("");
  const [genePage, setGenePage] = useState(1);
  const [geneList, setGeneList] = useState({ items: [], total: 0, page: 1, page_size: 25 });
  const [geneDetails, setGeneDetails] = useState({});
  const [expandedGene, setExpandedGene] = useState(false);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadModelName, setUploadModelName] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [temporaryPreviews, setTemporaryPreviews] = useState([]);

  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const uploadInputRef = useRef(null);
  const mainControlsRowRef = useRef(null);

  const benchmarkLaunchDateLabel = useMemo(() => {
    if (!status?.launched_at) {
      return "Benchmark launch date: —";
    }
    const parsed = Number(status.launched_at);
    if (!Number.isFinite(parsed)) {
      return "Benchmark launch date: —";
    }
    return `Benchmark launch date: ${new Date(parsed * 1000).toLocaleString()}`;
  }, [status]);

  const selectedK = useMemo(() => {
    const parsed = Number(selectedKInput);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(parsed, 500));
  }, [selectedKInput]);

  const modelsCombined = useMemo(() => {
    const base = overview?.models || [];
    const temporaryModels = temporaryPreviews.map((item) => item.model).filter(Boolean);
    return [...base, ...temporaryModels];
  }, [overview, temporaryPreviews]);

  const temporaryPreviewMap = useMemo(
    () => Object.fromEntries(temporaryPreviews.map((item) => [item.model?.model_id, item])),
    [temporaryPreviews],
  );

  const chartModels = useMemo(() => {
    if (!selectedModels.length) {
      return modelsCombined;
    }
    return modelsCombined.filter((item) => selectedModels.includes(item.model_id));
  }, [modelsCombined, selectedModels]);
  const sortedChartModels = useMemo(() => {
    const withScore = chartModels.map((model) => {
      const values = model?.curves?.[graphBranch]?.[graphMetric] || [];
      const total = values.reduce((acc, value) => acc + Number(value || 0), 0);
      return { model, total };
    });
    withScore.sort((a, b) => b.total - a.total);
    return withScore.map((item) => item.model);
  }, [chartModels, graphBranch, graphMetric]);

  const chartData = useMemo(() => {
    if (!overview?.k_values?.length) {
      return [];
    }
    return overview.k_values.map((kValue, index) => {
      const row = { k: kValue };
      sortedChartModels.forEach((model) => {
        row[model.model_id] = model?.curves?.[graphBranch]?.[graphMetric]?.[index] ?? null;
      });
      return row;
    });
  }, [overview, sortedChartModels, graphBranch, graphMetric]);

  const mainRows = useMemo(() => {
    if (!modelsCombined.length) {
      return [];
    }

    const rows = modelsCombined.map((model) => ({
      model_id: model.model_id,
      display_name: model.display_name,
      reference_url: model.reference_url,
      temporary: model.temporary,
      exon_interval_f1: modelValueAtK(overview, model, "exon", "interval_f1", selectedK),
      exon_interval_mi: modelValueAtK(overview, model, "exon", "interval_mi", selectedK),
      exon_segmentation_f1: modelValueAtK(overview, model, "exon", "segmentation_f1", selectedK),
      exon_segmentation_mi: modelValueAtK(overview, model, "exon", "segmentation_mi", selectedK),
      cds_interval_f1: modelValueAtK(overview, model, "cds", "interval_f1", selectedK),
      cds_interval_mi: modelValueAtK(overview, model, "cds", "interval_mi", selectedK),
      cds_segmentation_f1: modelValueAtK(overview, model, "cds", "segmentation_f1", selectedK),
      cds_segmentation_mi: modelValueAtK(overview, model, "cds", "segmentation_mi", selectedK),
      annotated_genes: model?.annotated_genes?.all?.all?.[selectedK]?.count ?? 0,
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
        "annotated_genes",
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
      const response = await fetch(`/api/leaderboard/overview?use_strand=${useStrand ? "true" : "false"}`);
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
  }, [useStrand]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      reloadLeaderboard();
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [useStrand]);

  useEffect(() => {
    if (window?.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [leaderboardExpanded, overview]);

  useEffect(() => {
    const root = mainControlsRowRef.current;
    if (!root) return;
    const primaryCheckbox = root.querySelector('.use-strand-control .MuiCheckbox-root');
    const primaryLabel = root.querySelector('.use-strand-control .MuiTypography-root');
    if (primaryCheckbox) primaryCheckbox.style.display = "";
    if (primaryLabel) primaryLabel.style.display = "";

    const allCheckboxes = root.querySelectorAll('.MuiCheckbox-root');
    allCheckboxes.forEach((el) => {
      if (el !== primaryCheckbox) el.style.display = 'none';
    });

    const duplicateLabels = Array.from(root.querySelectorAll('.MuiTypography-root')).filter(
      (el) => el !== primaryLabel && el.textContent?.trim() === 'Use strand',
    );
    duplicateLabels.forEach((el) => {
      el.style.display = 'none';
    });
  }, [useStrand, sortMetric, selectedKInput]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    setSelectedKInput((current) => (current === "" ? "" : current || `${overview.default_k ?? 250}`));

    if (modelsCombined.length > 0) {
      setSelectedModels((current) => {
        const allIds = modelsCombined.map((item) => item.model_id);
        if (!current.length) {
          return mainRows.slice(0, 5).map((row) => row.model_id);
        }
        return current.filter((item) => allIds.includes(item));
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

    const temporaryIds = new Set(temporaryPreviews.map((item) => item.model?.model_id).filter(Boolean));
    const fullMetricsModelIds = selectedModels.filter((item) => !temporaryIds.has(item));
    const params = new URLSearchParams({
      branch: fullBranch,
      k: `${selectedK}`,
      use_strand: useStrand ? "true" : "false",
    });

    if (fullMetricsModelIds.length > 0) {
      params.set("model_ids", fullMetricsModelIds.join(","));
    }

    params.set("use_strand", useStrand ? "true" : "false");
    fetch(`/api/leaderboard/full-metrics?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        const rows = [...(payload.rows || [])];
        temporaryPreviews.forEach((preview) => {
          const tempId = preview.model?.model_id;
          if (tempId && selectedModels.includes(tempId)) {
            const localRow = (preview.full_metrics_by_strand?.[useStrand ? "true" : "false"]?.[fullBranch]?.[selectedK]) || preview.full_metrics?.[fullBranch]?.[selectedK];
            if (localRow) rows.push(localRow);
          }
        });
        rows.sort((a, b) => {
          const sum = (row) =>
            ["interval_precision","interval_recall","interval_f1","interval_mi","segmentation_precision","segmentation_recall","segmentation_f1","segmentation_mi","part_precision","part_recall","part_f1","annotated_genes"]
              .reduce((acc, key) => acc + Number(row?.[key] || 0), 0);
          return sum(b) - sum(a);
        });
        setFullMetrics({ ...payload, rows });
      })
      .catch(() => setFullMetrics(null));
  }, [overview, modelsCombined, fullBranch, selectedK, selectedModels, temporaryPreviews, useStrand]);

  useEffect(() => {
    if (!stratModel) {
      setStratifier(null);
      return;
    }

    const stratPreview = temporaryPreviewMap[stratModel];
    if (stratPreview) {
      const rows = Object.entries(((stratPreview.stratifier_by_strand?.[useStrand ? "true" : "false"] || stratPreview.stratifier)?.[stratBranch]?.[stratRule]) || {})
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
      use_strand: useStrand ? "true" : "false",
    });

    fetch(`/api/leaderboard/stratifier?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setStratifier(payload))
      .catch(() => setStratifier(null));
  }, [stratModel, stratBranch, stratRule, selectedK, temporaryPreviewMap, useStrand]);

  useEffect(() => {
    const params = new URLSearchParams({
      branch: detailBranch,
      query: geneQuery,
      page: `${genePage}`,
      page_size: "25",
      use_strand: useStrand ? "true" : "false",
    });

    fetch(`/api/leaderboard/genes?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => setGeneList(payload))
      .catch(() => setGeneList({ items: [], total: 0, page: 1, page_size: 25 }));
  }, [detailBranch, geneQuery, genePage, useStrand]);

  const fetchGeneDetail = useCallback(async (geneId) => {
    const cacheKey = `${detailBranch}|${geneId}|${selectedK}|${selectedModels.join(",")}`;
    if (geneDetails[cacheKey]) {
      return;
    }

    const temporaryIds = new Set(temporaryPreviews.map((item) => item.model?.model_id).filter(Boolean));
    const geneDetailModelIds = selectedModels.filter((item) => !temporaryIds.has(item));
    const params = new URLSearchParams({
      branch: detailBranch,
      k: `${selectedK}`,
      use_strand: useStrand ? "true" : "false",
    });

    if (geneDetailModelIds.length > 0) {
      params.set("model_ids", geneDetailModelIds.join(","));
    }

    const response = await fetch(`/api/leaderboard/gene/${encodeURIComponent(geneId)}?${params.toString()}`);
    const payload = await response.json();

    payload.gene.transcripts = payload.gene.transcripts.map((transcript) => {
      let merged = transcript;
      temporaryPreviews.forEach((preview) => {
        const temporaryModelId = preview.model?.model_id;
        if (!temporaryModelId || !selectedModels.includes(temporaryModelId)) return;
        const local = ((preview.detailed_by_strand?.[useStrand ? "true" : "false"] || preview.detailed)?.[detailBranch]?.[transcript.transcript_id]);
        if (!local) return;

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
          const predMeta = preview.prediction_index?.[predId] || {};
          const candidates = [intervalMap[predId], segmentationMap[predId]].filter((value) => Number.isFinite(value));
          const minK = candidates.length ? Math.min(...candidates) : null;
          return {
            model_id: temporaryModelId,
            model_name: preview.model.display_name,
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

        merged = {
          ...merged,
          matched_predictions: [...merged.matched_predictions, ...extras],
          matched_prediction_count: merged.matched_predictions.length + extras.length,
        };
      });
      return merged;
    });

    setGeneDetails((current) => ({ ...current, [cacheKey]: payload }));
  }, [detailBranch, geneDetails, selectedK, selectedModels, temporaryPreviews]);

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

      const response = await fetch("/api/leaderboard/upload", {
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

      setTemporaryPreviews((current) => {
        const next = current.filter((item) => item.model?.model_id !== payload.model?.model_id);
        return [...next, payload];
      });
      setUploadMessage("Temporary preview loaded.");
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

  const showProgress = Boolean(
    !status?.ready &&
      (
        status?.running ||
        (status?.upload_current && status.upload_current !== "idle") ||
        (status?.message && /comput|build|load/i.test(status.message))
      ),
  );

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
    <Stack spacing={0}>
      <Paper
        sx={{
          px: { xs: 4.4, md: 5.2 },
          pt: { xs: 0.4, md: 0.5 },
          pb: { xs: 0.4, md: 0.5 },
          order: -1,
          mt: -1.1,
          mb: 2.0,
          position: "sticky",
          top: 74,
          zIndex: 20,
          backgroundColor: "transparent !important",
          boxShadow: "none",
          backdropFilter: "none",
          border: "none",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            overflowX: "auto",
            overflowY: "visible",
            whiteSpace: "nowrap",
            justifyContent: "center",
            pt: 1.0,
            pb: 1.0,
            px: 1.2,
          }}
        >
          {[
            ["tldr", "TLDR"],
            ["main-metrics", "Main metrics"],
            ["metric-curves", "Metric curves"],
            ["full-metrics", "Full metrics"],
            ["stratifier", "Stratifier"],
            ["detailed-info", "Detailed information"],
            ["leaderboard-description", "Leaderboard description"],
            ["submission", "Benchmark your own annotation"],
          ].map(([id, label]) => (
            <Button
              key={id}
              size="small"
              href={`#${id}`}
              variant="contained"
              sx={{
                backgroundColor: "#d9f4ec",
                color: "primary.main",
                borderRadius: "999px",
                textTransform: "none",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.12)",
                my: 0.6,
                px: 1.6,
                "&:hover": { backgroundColor: "#c7ecdf" },
              }}
            >
              {label}
            </Button>
          ))}
        </Stack>
      </Paper>

      <Paper className="glass-card hero-card" id="leaderboard-description" sx={{ p: { xs: 2.4, md: 3.4 }, order: 6, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={2}>
          <SectionTitle title="Leaderboard description" />

          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                maxHeight: leaderboardExpanded ? "none" : 352,
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
          {status?.debug_log?.length && (!status?.ready || Boolean(status?.error)) ? (
            <Alert severity="info">
              <Typography component="div" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.76rem", maxHeight: 220, overflow: "auto" }}>
                {status.debug_log.slice(-25).join("\n")}
              </Typography>
            </Alert>
          ) : null}

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

      <Paper className="glass-card" id="submission" sx={{ p: { xs: 2.2, md: 3 }, order: 7, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={1.8}>
          <SectionTitle
            title="Benchmark your own annotation"
            subtitle="Upload your own prediction GFF, give it a model name, and compare it with the leaderboard models for the current browser session."
            constrainSubtitle={false}
          />

          <Typography color="text.secondary" sx={{ fontSize: "0.8rem", lineHeight: 1.45 }}>
            Temporary submissions are processed one by one for all users. After processing, your uploaded model appears on this page for the current session only. It is not saved in persistent Space storage and disappears after page refresh. For permanent inclusion, open a pull request to the provided GitHub repository with your prediction file and model name.
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

          <Typography color="text.secondary">Queue length: {status?.upload_queue_length ?? 0}.</Typography>

          {uploadLoading ? (
            <Box className="score-calc-animation">
              <span className="orb" />
              <Typography color="text.secondary">Calculating metrics for you model...</Typography>
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

      <Paper className="glass-card" id="tldr" sx={{ p: { xs: 2.2, md: 3 }, order: 0, mt: 0, scrollMarginTop: "132px" }}>
        <Stack spacing={1.4}>
          <SectionTitle title="TLDR" />
          <Typography color="text.secondary" sx={{ fontSize: "0.92rem", lineHeight: 1.55, fontWeight: 700 }}>
            This leaderboard evaluates gene annotation models against human reference annotation. For protein-coding genes performance, sort by F1 with seg. on CDS. For all genes, including lncRNA, sort by F1 with seg. on exons. Current leaders: GENATATOR for all genes and Tiberius for protein-coding genes. To submit your model jump <a href="https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git" target="_blank" rel="noreferrer" style={{ color: "var(--mui-palette-primary-main)", textDecoration: "underline" }}>https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git</a>
          </Typography>
                  </Stack>
      </Paper>

      <Paper className="glass-card" id="main-metrics" sx={{ p: { xs: 2.2, md: 3 }, order: 1, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={1.2}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", lg: "center" }}
          >
            <Stack spacing={0.6}>
              <SectionTitle
                title="Main metrics"
                subtitle="Choose the tolerance k and quickly compare all models. This table shows the most important exon and CDS scores in one place."
              />
            </Stack>

            <Stack ref={mainControlsRowRef} direction={{ xs: "column", sm: "row" }} spacing={1.2}>

              <Box
                className="use-strand-control"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.6,
                  pr: 1.6,
                  mr: 2.0,
                  borderRight: "1px solid rgba(15, 118, 110, 0.18)",
                }}
              >
                <Typography>Use strand</Typography>
                <Checkbox checked={useStrand} onChange={(event) => setUseStrand(event.target.checked)} />
              </Box>

              <Box sx={{ width: { xs: 0, sm: 12 }, flex: "0 0 auto" }} />

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
                sx={{ width: 120, ml: { sm: 3.0 }, ...uniformFieldSx }}
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
                    <TableCell rowSpan={2} sx={{ width: 56, minWidth: 56 }}>
                      Rank
                    </TableCell>
                    <TableCell rowSpan={2} sx={{ width: 280, minWidth: 280 }}>Model</TableCell>
                    <TableCell rowSpan={2} sx={{ width: 165, minWidth: 165 }}>Annotated genes</TableCell>
                    <TableCell colSpan={4} align="center">
                      Exon
                    </TableCell>
                    <TableCell colSpan={4} align="center">
                      CDS
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className={highlightedMainSortColumn === "exon_interval_f1" ? "rank-column-highlight" : undefined}>F1 w/o seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "exon_interval_mi" ? "rank-column-highlight" : undefined}>MI w/o seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "exon_segmentation_f1" ? "rank-column-highlight" : undefined}>F1 with seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "exon_segmentation_mi" ? "rank-column-highlight" : undefined}>MI with seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "cds_interval_f1" ? "rank-column-highlight" : undefined}>F1 w/o seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "cds_interval_mi" ? "rank-column-highlight" : undefined}>MI w/o seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "cds_segmentation_f1" ? "rank-column-highlight" : undefined}>F1 with seg.</TableCell>
                    <TableCell className={highlightedMainSortColumn === "cds_segmentation_mi" ? "rank-column-highlight" : undefined}>MI with seg.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mainRows.map((row, index) => (
                    <TableRow key={row.model_id}>
                      <TableCell sx={{ width: 56, minWidth: 56 }}>{index + 1}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {row.reference_url ? (
                            <Typography
                              component="a"
                              href={row.reference_url}
                              target="_blank"
                              rel="noreferrer"
                              fontWeight={760}
                              sx={{ color: "primary.main", textDecoration: "underline" }}
                            >
                              {row.display_name}
                            </Typography>
                          ) : (
                            <Typography fontWeight={760}>{row.display_name}</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ width: 165, minWidth: 165 }}>{formatScore(row.annotated_genes, 0)}</TableCell>
                      <TableCell
                        className={highlightedMainSortColumn === "exon_interval_f1" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "exon_interval_mi" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "exon_segmentation_f1" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "exon_segmentation_mi" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "cds_interval_f1" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "cds_interval_mi" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "cds_segmentation_f1" ? "rank-column-highlight" : undefined}
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
                        className={highlightedMainSortColumn === "cds_segmentation_mi" ? "rank-column-highlight" : undefined}
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

      <Paper className="glass-card" id="metric-curves" sx={{ p: { xs: 2.2, md: 3 }, order: 2, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={1.2}>
            <SectionTitle
              title="Metric curves"
              subtitle="See how a selected score changes when k changes. Choose the branch, metric, and models, then click to set the active k for the rest of the leaderboard."
            />
            <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2} alignItems={{ lg: "center" }}>
              <BranchTabs value={graphBranch} onChange={setGraphBranch} />
              <TextField
                select
                label="Metric"
                value={graphMetric}
                onChange={(event) => setGraphMetric(event.target.value)}
                SelectProps={{
                  MenuProps: {
                    PaperProps: {
                      sx: { backgroundColor: "#ffffff", opacity: 1, backdropFilter: "none" },
                    },
                  },
                }}
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
            slotProps={{ paper: { sx: { backgroundColor: "#ffffff", opacity: 1, backdropFilter: "none" } } }}
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
                  itemSorter={(item) => -Number(item?.value ?? -Infinity)}
                  formatter={(value) => {
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric.toFixed(4) : "—";
                  }}
                />
                <Legend formatter={(value)=>value} />
                {CHART_AXIS_TICKS.map((tick) => (
                  <ReferenceLine key={`tick-${tick}`} x={tick} stroke="#94a3b8" strokeDasharray="4 4" />
                ))}
                <ReferenceLine x={selectedK} stroke="#334155" strokeDasharray="4 4" />
                {sortedChartModels.map((model, index) => (
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

      <Paper className="glass-card" id="full-metrics" sx={{ p: { xs: 2.2, md: 3 }, order: 3, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            justifyContent="space-between"
            spacing={1.2}
            alignItems={{ xs: "flex-start", lg: "flex-start" }}
          >
            <SectionTitle
              title="Full metrics"
              subtitle="View the complete set of scores for the selected models at the active k. Use this panel when you want more detail than the Main metrics table provides."
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
                    <TableCell rowSpan={2} sx={{ width: 280, minWidth: 280 }}>
                      Model
                    </TableCell>
                    <TableCell rowSpan={2} sx={{ width: 165, minWidth: 165 }}>Annotated genes</TableCell>
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
                      <TableCell sx={{ width: 280, minWidth: 280 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {row.reference_url ? (
                            <Typography
                              component="a"
                              href={row.reference_url}
                              target="_blank"
                              rel="noreferrer"
                              fontWeight={760}
                              sx={{ color: "primary.main", textDecoration: "underline" }}
                            >
                              {row.display_name}
                            </Typography>
                          ) : (
                            <Typography fontWeight={760}>{row.display_name}</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ width: 165, minWidth: 165 }}>{formatScore(row.annotated_genes, 0)}</TableCell>
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

      <Paper className="glass-card" id="stratifier" sx={{ p: { xs: 2.2, md: 3 }, order: 4, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            justifyContent="space-between"
            spacing={1.2}
            alignItems={{ xs: "flex-start", lg: "flex-start" }}
          >
            <SectionTitle
              title="Stratifier"
              subtitle="Check whether a model performs differently across groups such as transcript type, strand, or chromosome. Choose a model, a branch, and a grouping rule."
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
                    <TableCell sx={{ width: 165, minWidth: 165 }}>Annotated genes</TableCell>
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
                      <TableCell sx={{ width: 165, minWidth: 165 }}>{formatScore(row.annotated_genes, 0)}</TableCell>
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

      <Paper className="glass-card" id="detailed-info" sx={{ p: { xs: 2.2, md: 3 }, order: 5, mt: 3.2, scrollMarginTop: "132px" }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            justifyContent="space-between"
            spacing={1.2}
            alignItems={{ xs: "flex-start", lg: "flex-start" }}
          >
            <SectionTitle
              title="Detailed information"
              subtitle="Look up a ground-truth gene or transcript and see which model predictions recovered it. This panel is for checking individual biological examples, not only summary scores."
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
                                    <Chip size="small" color={transcript.is_annotated ? "success" : "default"} label={transcript.is_annotated ? "✅ Complete mRNA annotation" : "❌ No complete mRNA annotations"} />
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
                                            <TableCell sx={{ width: 54, minWidth: 54 }}>Min k</TableCell>
                                            <TableCell>Complete mRNA annotation</TableCell>
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
                                              <TableCell sx={{ width: 54, minWidth: 54 }}>{formatScore(match.min_k, 0)}</TableCell>
                                              <TableCell>
                                                {new Set((transcript.annotated_transcripts || []).map((item) => item.pred_id)).has(match.pred_id)
                                                  ? "✅"
                                                  : "❌"}
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

              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={1.2}
                sx={{ mt: 1.6, pt: 0.6 }}
              >
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

      <Paper className="glass-card" sx={{ p: { xs: 2.0, md: 2.4 }, order: 8, mt: 3.2 }}>
        <Typography color="text.secondary">{benchmarkLaunchDateLabel}</Typography>
      </Paper>
    </Stack>
  );
}
