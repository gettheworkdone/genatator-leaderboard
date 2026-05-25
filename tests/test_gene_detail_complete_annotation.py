from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.service import LeaderboardService, ModelBundle


def _bundle(model_id: str, pred_id: str, complete_min_k):
    detail_branch = {
        "tx1": {
            "interval-level": {"predictions": [{"pred_id": pred_id, "min_k": 1}]},
            "segmentation-level": {"predictions": [{"pred_id": pred_id, "min_k": 1}]},
        }
    }
    exon_entry = {"tx1": {"annotated_transcripts": []}}
    if complete_min_k is not None:
        exon_entry["tx1"]["annotated_transcripts"] = [{"pred_id": pred_id, "min_k": complete_min_k}]

    return ModelBundle(
        model_id=model_id,
        display_name=model_id,
        temporary=False,
        branch_results_by_strand={},
        stratifier_by_strand={},
        detailed_by_strand={True: {"exon": exon_entry, "cds": detail_branch}},
        annotated_genes_by_strand={},
        prediction_index={pred_id: {"chromosome": "chr1", "start": 1, "end": 2, "strand": "+", "exon_segments": [], "cds_segments": []}},
    )


def _service_with(bundles):
    service = LeaderboardService.__new__(LeaderboardService)
    service._ground_truth_indices_by_strand = {
        True: {
            "cds": {
                "genes": {
                    "g1": {
                        "gene_id": "g1",
                        "transcripts": [
                            {
                                "transcript_id": "tx1",
                                "transcript_type": "mRNA",
                                "length": 100,
                                "chromosome": "chr1",
                                "start": 1,
                                "end": 100,
                                "strand": "+",
                                "exon_segments": [],
                                "cds_segments": [],
                            }
                        ],
                    }
                }
            }
        }
    }
    service._selected_bundles = lambda model_ids: [b for b in bundles if model_ids is None or b.model_id in model_ids]
    return service


def _row(detail, model_id):
    return next(item for item in detail["gene"]["transcripts"][0]["matched_predictions"] if item["model_id"] == model_id)


def test_gene_detail_complete_annotation_is_model_specific_and_order_independent():
    bundle_a = _bundle("A", "dup", None)
    bundle_b = _bundle("B", "dup", 1)
    service = _service_with([bundle_a, bundle_b])

    detail_ab = service.gene_detail("cds", "g1", 1, ["A", "B"], True)
    tx_ab = detail_ab["gene"]["transcripts"][0]
    assert tx_ab["is_annotated"] is True
    assert _row(detail_ab, "A")["complete_mrna_annotation"] is False
    assert _row(detail_ab, "B")["complete_mrna_annotation"] is True

    detail_ba = service.gene_detail("cds", "g1", 1, ["B", "A"], True)
    tx_ba = detail_ba["gene"]["transcripts"][0]
    assert tx_ba["is_annotated"] is True
    assert _row(detail_ba, "A")["complete_mrna_annotation"] is False
    assert _row(detail_ba, "B")["complete_mrna_annotation"] is True

    detail_a = service.gene_detail("cds", "g1", 1, ["A"], True)
    assert detail_a["gene"]["transcripts"][0]["is_annotated"] is False

    detail_b = service.gene_detail("cds", "g1", 1, ["B"], True)
    assert detail_b["gene"]["transcripts"][0]["is_annotated"] is True


def test_gene_detail_complete_annotation_respects_min_k_threshold():
    bundle_a = _bundle("A", "dup", None)
    bundle_b = _bundle("B", "dup", 3)
    service = _service_with([bundle_a, bundle_b])

    detail = service.gene_detail("cds", "g1", 2, ["A", "B"], True)
    tx = detail["gene"]["transcripts"][0]
    assert tx["is_annotated"] is False
    assert _row(detail, "B")["complete_mrna_annotation_min_k"] == 3
    assert _row(detail, "B")["complete_mrna_annotation"] is False
