from pathlib import Path
import hashlib,json,re,subprocess,datetime,sys
root=Path(__file__).resolve().parents[4]
pkg=root/"docs/architecture/v3.1a"
results=[]
def check(name,condition,detail=None):
    results.append({"name":name,"status":"PASS" if condition else "FAIL",**({"detail":detail} if detail else {})})
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
downloads=Path.home()/"Downloads"
names=["BOS-V31A-ARCH-01 — Nhiệm vụ thiết kế kiến trúc giao Codex.md","BUSINESS_AI_OS_KIEN_TRUC_V3_1_SAN_PHAM_20261016.pdf","BUSINESS_AI_OS_KIEN_TRUC_V2_3_N8N_20261016.pdf","Business AI OS V3.0 — Kiến trúc sản phẩm cho SME đa ngành.pdf","BUSINESS_AI_OS_KIEN_TRUC_TONG_THE_20261016.png"]
manifest={"source_policy":"Original files remain in user Downloads. Manifest pins filename/bytes/hash; no original PII-bearing author line is published.","recorded_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"files":[],"missing_sources":[{"name":"original nine-finding architecture audit","status":"SOURCE_UNVERIFIED"},{"name":"original ten-point diagram assessment","status":"SOURCE_UNVERIFIED"},{"name":"BOS-V23-SETUP-01 original task","status":"SOURCE_UNVERIFIED"}]}
for name in names:
    f=downloads/name
    item={"filename":name,"source_location_class":"USER_PROVIDED_DOWNLOADS","status":"READ" if f.exists() else "MISSING"}
    if f.exists(): item.update({"sha256":digest(f),"bytes":f.stat().st_size})
    manifest["files"].append(item)
(pkg/"sources").mkdir(exist_ok=True)
(pkg/"sources/manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
original=(downloads/names[0]).read_text(encoding="utf-8-sig").splitlines()
copied=(pkg/"TASK.md").read_text(encoding="utf-8-sig").splitlines()
check("TASK_same_line_count",len(original)==len(copied))
check("TASK_only_author_line_redacted",all(a==b for i,(a,b) in enumerate(zip(original,copied)) if i!=2))
questions=(pkg/"open-questions.md").read_text(encoding="utf-8-sig")
check("source_quotes_exact_at_L24_L85_L110",all(original[n-1] in questions for n in [24,85,110]))
# Local links only; ignore external/anchor, code-template paths and directory listing references.
broken=[]
for f in pkg.rglob("*.md"):
    for value in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)",f.read_text(encoding="utf-8-sig")):
        value=value.strip("<>").split("#")[0]
        if not value or re.match(r"^[a-zA-Z]+:",value): continue
        if not (f.parent/value).exists(): broken.append({"file":str(f.relative_to(root)),"target":value})
check("local_markdown_links",not broken,broken if broken else None)
for f in pkg.rglob("*.json"):
    try: json.loads(f.read_text(encoding="utf-8-sig"))
    except Exception as e: check("JSON_"+f.name,False,type(e).__name__)
def trows(p):
    rows={}
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        m=re.match(r"\| (T\d\d) —",line)
        if m:
            cells=line.split("|"); rows[m[1]]=[re.sub(r"\s+"," ",v.strip()) for v in cells[1:3]]
    return rows
old=trows(root/"docs/architecture/overall-design-20261016/BACKLOG_ACCEPTANCE.md")
new=trows(pkg/"acceptance-matrix.md")
check("T01_T20_exact_names_and_conditions",all(new.get(f"T{i:02}")==old.get(f"T{i:02}") for i in range(1,21)))
accept=(pkg/"acceptance-matrix.md").read_text(encoding="utf-8-sig")
check("24_new_cases_not_run",sum(bool(re.match(r"\| V3A-T\d\d ",l)) and l.rstrip().endswith("NOT_RUN |") for l in accept.splitlines())==24)
man=json.loads((pkg/"inventory/migration-manifest.json").read_text(encoding="utf-8-sig"))
files=man["files"]
check("722_manifest_entries",len(files)==722)
check("migration_manifest_content_hashes",all(hashlib.sha256((root/"database"/x["filename"]).read_bytes().decode("utf-8",errors="replace").replace("\r\n","\n").encode()).hexdigest()==x["checksum"] for x in files))
check("migration_manifest_catalog_hash",hashlib.sha256(json.dumps(files,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()==man["catalog_sha256"])
# Actual scanner of complete branch additions/changes + not-yet-tracked package.
base="fe3f4398ebf2186596c108a7570f83e3bbef104a"
gitfiles=subprocess.check_output(["git","diff","--name-only",base],cwd=root,text=True).splitlines()
paths={root/x for x in gitfiles if (root/x).is_file()}|{x for x in pkg.rglob("*") if x.is_file()}
patterns={
"PRIVATE_KEY":r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
"COMMON_TOKEN":r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b",
"JWT":r"\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b",
"PASSWORD_URL":r"(?i)\b(?:postgres(?:ql)?|mysql|redis)://[^:\s/]+:[^@\s]{3,}@",
"EMAIL":r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
"VN_PHONE":r"(?<![A-Za-z0-9])(?:0[35789]\d{8}|\+84[35789]\d{8})(?![A-Za-z0-9])",
}
findings=[];preexisting=[];text_count=0;binary_count=0
author=original[2].split("·")[-1].strip().lstrip("@")
for f in sorted(paths):
    if f.name=="package-results.json": continue # generated scanner report, no payload matches
    try: s=f.read_text(encoding="utf-8-sig")
    except (UnicodeError,ValueError): binary_count+=1;continue
    text_count+=1
    rel=str(f.relative_to(root)).replace("\\","/")
    old=subprocess.run(["git","show",base+":"+rel],cwd=root,capture_output=True).stdout.decode("utf-8",errors="replace")
    def record(rule,start):
        line=s[:start].count("\n")+1
        line_text=s.splitlines()[line-1]
        item={"file":rel,"line":line,"rule":rule}
        (preexisting if line_text in old.splitlines() else findings).append(item)
    for label,pat in patterns.items():
        for m in re.finditer(pat,s):
            val=m.group()
            if label=="EMAIL" and (val.endswith(".test") or val.endswith("@example.com") or val.endswith("@example.org")):continue
            record(label,m.start())
    if author and author in s: record("SOURCE_AUTHOR_NAME",s.index(author))
check("secret_pii_pattern_scan",not findings,findings if findings else None)
# Static source structure, NOT a Mermaid parser.
diagrams=list((pkg/"diagrams").glob("*.mmd"))
check("mermaid_sources_present",len(diagrams)>=4 and all(f.read_text().splitlines()[0].split()[0] in ["flowchart","stateDiagram-v2","sequenceDiagram"] for f in diagrams))
report={"observed_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"kind":"LOCAL_ARTIFACT_CHECK_NOT_RUNTIME","results":results,"scanner":{"name":"bos-local-secret-pii-pattern-scanner","version":"1.0","scope_base":base,"text_files":text_count,"binary_files_not_text_scanned":binary_count,"rule_ids":list(patterns)+["SOURCE_AUTHOR_NAME"],"findings":findings,"preexisting_baseline_matches":preexisting,"limitations":"Full new-file/changed-file regex scan; identical legacy baseline lines classified separately and not introduced in this PR. Regex + known source author check, not exhaustive PII/secret detection; images/binaries require manual review. Does not query or export real customer data."},"mermaid_parser_render":"NOT_RUN"}
(pkg/"checks/package-results.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"checks":len(results),"failures":[x for x in results if x["status"]=="FAIL"],"scan_text_files":text_count,"binary_files":binary_count},ensure_ascii=False,indent=2))
sys.exit(1 if any(x["status"]=="FAIL" for x in results) else 0)
