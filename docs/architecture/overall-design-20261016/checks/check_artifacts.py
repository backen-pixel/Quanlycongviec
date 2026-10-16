"""Offline artifact structure checks; no Mermaid parser or runtime acceptance."""
import json
import re
import struct
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
json_files = sorted(root.rglob("*.json"))
for source in json_files:
    json.loads(source.read_text(encoding="utf-8"))
diagrams = root / "diagrams"
files = sorted(diagrams.glob("*.mmd"))
assert len(files) == 9
for source in files:
    lines = [line.strip() for line in source.read_text(encoding="utf-8").splitlines()
             if line.strip() and not line.strip().startswith("%%")]
    assert lines[0].startswith(("flowchart ", "sequenceDiagram", "erDiagram")), source.name
    stack = []
    for line in lines[1:]:
        word = line.split()[0]
        if word in {"subgraph", "alt", "opt", "loop", "par", "rect", "critical"}:
            stack.append(word)
        elif word == "end":
            assert stack, source.name
            stack.pop()
    assert not stack, (source.name, stack)
    if lines[0] == "erDiagram":
        assert sum(line.endswith(" {") for line in lines) == lines.count("}"), source.name
        for line in lines:
            if re.match(r"^\w+\s+[^ ]+(?:--|\.\.)", line):
                relation = line.split()[1]
                assert re.fullmatch(r"(?:\|o|\|\||\}o|\}\|)(?:--|\.\.)(?:o\||\|\||o\{|\|\{)", relation), relation
    assert "DESIGN_PROPOSAL / NOT_LIVE" in source.read_text(encoding="utf-8"), source.name

ET.parse(diagrams / "overall.svg")
png = (diagrams / "overall.png").read_bytes()
assert png[:8] == b"\x89PNG\r\n\x1a\n"
dimensions = struct.unpack(">II", png[16:24])
assert dimensions == (1800, 1760)
result = {"classification": "LOCAL_DESIGN_CHECK", "checked_at": datetime.now(timezone.utc).isoformat(),
          "mermaid_sources": len(files), "block_structure": "PASS", "svg_xml": "PASS", "json_syntax": "PASS",
          "png_dimensions": list(dimensions), "mermaid_parser_render": "NOT_RUN",
          "limits": "Structural sanity only; visual review recorded in EVIDENCE; no runtime proof"}
(root / "checks/artifact-results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result))
