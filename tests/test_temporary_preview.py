import threading
import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.service import LeaderboardService


def _tiny_true_gff() -> str:
    return """chr1\t.\tgene\t1\t200\t.\t+\t.\tID=g1\nchr1\t.\tmRNA\t1\t200\t.\t+\t.\tID=tx1;Parent=g1;transcript_id=tx1;gene_id=g1\nchr1\t.\texon\t1\t100\t.\t+\t.\tParent=tx1\nchr1\t.\texon\t150\t200\t.\t+\t.\tParent=tx1\nchr1\t.\tCDS\t10\t90\t.\t+\t0\tParent=tx1\nchr1\t.\tCDS\t160\t190\t.\t+\t0\tParent=tx1\nchr1\t.\tgene\t300\t380\t.\t+\t.\tID=g2\nchr1\t.\tlnc_RNA\t300\t380\t.\t+\t.\tID=tx2;Parent=g2;transcript_id=tx2;gene_id=g2\nchr1\t.\texon\t300\t380\t.\t+\t.\tParent=tx2\n"""


def _tiny_pred_gff() -> str:
    return """chr1\t.\tmRNA\t1\t200\t.\t+\t.\tID=ptx1;transcript_id=ptx1\nchr1\t.\texon\t1\t99\t.\t+\t.\tParent=ptx1\nchr1\t.\texon\t150\t200\t.\t+\t.\tParent=ptx1\nchr1\t.\tCDS\t10\t89\t.\t+\t0\tParent=ptx1\nchr1\t.\tCDS\t160\t190\t.\t+\t0\tParent=ptx1\nchr1\t.\tlnc_RNA\t300\t380\t.\t+\t.\tID=ptx2;transcript_id=ptx2\nchr1\t.\texon\t301\t380\t.\t+\t.\tParent=ptx2\n"""


def _mk_service(tmp_path: Path) -> LeaderboardService:
    (tmp_path / "leaderboard_data" / "ground_truth").mkdir(parents=True, exist_ok=True)
    (tmp_path / "leaderboard_data" / "ground_truth" / "chr20.gff").write_text(_tiny_true_gff(), encoding="utf-8")
    return LeaderboardService(tmp_path)


def _contains_key(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            return True
        return any(_contains_key(v, key) for v in obj.values())
    if isinstance(obj, list):
        return any(_contains_key(v, key) for v in obj)
    return False


def test_temporary_preview_not_persisted(tmp_path: Path):
    service = _mk_service(tmp_path)
    payload = service.compute_temporary_preview("tmp", _tiny_pred_gff())
    assert payload["model"]["temporary"] is True
    overview = service.overview(use_strand=True)
    assert all(m["model_id"] != payload["model"]["model_id"] for m in overview["models"])


def test_temporary_preview_has_no_matched_pairs(tmp_path: Path):
    service = _mk_service(tmp_path)
    payload = service.compute_temporary_preview("tmp", _tiny_pred_gff())
    assert not _contains_key(payload, "matched_pairs")


def test_temporary_preview_queue_fifo(tmp_path: Path, monkeypatch):
    service = _mk_service(tmp_path)
    call_order = []

    def fake_compute(name, gff):
        call_order.append(name)
        time.sleep(0.05)
        return {"model": {"model_id": name, "display_name": name, "temporary": True}}

    monkeypatch.setattr(service, "_compute_temporary_preview_direct", fake_compute)

    out = []

    def run(name):
        out.append(service.compute_temporary_preview(name, _tiny_pred_gff()))

    t1 = threading.Thread(target=run, args=("a",))
    t2 = threading.Thread(target=run, args=("b",))
    t3 = threading.Thread(target=run, args=("c",))
    t1.start(); t2.start(); t3.start()
    t1.join(); t2.join(); t3.join()

    assert call_order == ["a", "b", "c"]
    assert len(out) == 3
