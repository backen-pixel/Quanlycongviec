/**
 * Generate crm-split-report.canvas.tsx with full test catalogs embedded.
 */
const fs = require('fs');
const path = require('path');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '_crm-test-catalog.json'), 'utf8'));

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function suiteLiteral(name, arr) {
  const rows = arr.map((t) => `  { id: ${t.id}, name: '${esc(t.name)}' },`).join('\n');
  return `const ${name} = [\n${rows}\n];`;
}

const outPath = path.join(
  'C:/Users/Admin/.cursor/projects/c-Projects-Quanlycongviec/canvases/crm-split-report.canvas.tsx',
);

const body = `import {
  useHostTheme,
  computeDAGLayout,
  BarChart,
  Stack,
  H1,
  H2,
  H3,
  Text,
  Divider,
  Grid,
  Row,
  Stat,
  Card,
  CardHeader,
  CardBody,
  Table,
  Pill,
  Callout,
  Spacer,
  CollapsibleSection,
} from 'cursor/canvas';

/** Bao cao tach monolith CRM routes + day du catalog test — 2026-07-16 */

${suiteLiteral('TESTS_A', catalog.a)}

${suiteLiteral('TESTS_B', catalog.b)}

${suiteLiteral('TESTS_UI', catalog.ui)}

const MODULE_ROWS = [
  { module: 'leadLifecycle', routes: 43, lines: 3085, role: 'CRUD lead/deal, stage, project, docs' },
  { module: 'crmTasks', routes: 22, lines: 1572, role: 'Tasks CRM + attachments' },
  { module: 'commercialDocs', routes: 31, lines: 1338, role: 'Bao gia / don / hoa don / PDF' },
  { module: 'followupPlanner', routes: 21, lines: 700, role: 'Care, pin, planner, deadline' },
  { module: 'taxonomy', routes: 19, lines: 631, role: 'Types, sources, Zalo settings' },
  { module: 'pipelines', routes: 13, lines: 626, role: 'Pipelines + stages' },
  { module: 'reports', routes: 12, lines: 606, role: 'Org / staff report + SLA' },
  { module: 'leadsList', routes: 9, lines: 548, role: 'List, kanban bootstrap, picker' },
  { module: 'dashboard', routes: 9, lines: 548, role: 'Dashboard, live-version, alerts' },
  { module: 'taskTemplates', routes: 11, lines: 502, role: 'Template nhiem vu' },
  { module: 'membersChat', routes: 12, lines: 473, role: 'Members, assignments, chat' },
  { module: 'customers', routes: 9, lines: 425, role: 'Customers + regions' },
  { module: 'leadComments', routes: 8, lines: 374, role: 'Comments / reactions' },
  { module: 'leadDuplicates', routes: 5, lines: 221, role: 'Scan / merge / bulk-assign' },
];

const BAR_CATS = MODULE_ROWS.map((r) => r.module);
const BAR_LINES = MODULE_ROWS.map((r) => r.lines);
const BAR_ROUTES = MODULE_ROWS.map((r) => r.routes);

const ARCH_NODES = [
  { id: 'server' },
  { id: 'thin' },
  { id: 'index' },
  { id: 'mw' },
  { id: 'shared' },
  { id: 'list' },
  { id: 'life' },
  { id: 'docs' },
  { id: 'other' },
];

const ARCH_EDGES = [
  { from: 'server', to: 'thin' },
  { from: 'thin', to: 'index' },
  { from: 'index', to: 'mw' },
  { from: 'mw', to: 'list' },
  { from: 'mw', to: 'docs' },
  { from: 'mw', to: 'other' },
  { from: 'mw', to: 'life' },
  { from: 'list', to: 'life' },
  { from: 'shared', to: 'list' },
  { from: 'shared', to: 'docs' },
  { from: 'shared', to: 'other' },
  { from: 'shared', to: 'life' },
];

const NODE_LABEL: Record<string, string> = {
  server: 'server.js\\n/api/crm',
  thin: 'crm.js\\n(thin 2 dong)',
  index: 'crm/index.js\\ncomposition root',
  mw: 'auth + cache\\n+ assignee gate',
  shared: 'shared/\\nhelpersBundle',
  list: 'leadsList +\\nduplicates',
  life: 'leadLifecycle\\n(/leads/:id)',
  docs: 'commercialDocs\\n+ crmTasks',
  other: 'reports, pipelines\\ntaxonomy, ...',
};

function ArchitectureDag() {
  const { tokens: t } = useHostTheme();
  const layout = computeDAGLayout({
    nodes: ARCH_NODES,
    edges: ARCH_EDGES,
    direction: 'vertical',
    nodeWidth: 132,
    nodeHeight: 48,
    rankGap: 52,
    nodeGap: 28,
    padding: 16,
  });
  const accentIds = new Set(['index', 'mw', 'life']);

  return (
    <Stack gap={8}>
      <H3>So do kien truc sau tach</H3>
      <Text size="small" tone="secondary">
        Request: thin entry → composition root → middleware cha → feature routers. leadsList mount
        truoc leadLifecycle de path tinh (/leads/picker) khong bi :id nuot.
      </Text>
      <svg
        width="100%"
        viewBox={\`0 0 \${layout.width} \${layout.height}\`}
        style={{ maxWidth: layout.width, display: 'block' }}
      >
        <defs>
          <marker id="crmArrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0.5 L0,5.5 L6,3 z" fill={t.stroke.primary} />
          </marker>
        </defs>
        {layout.edges.map((e) => (
          <line
            key={\`\${e.from}-\${e.to}\`}
            x1={e.sourceX}
            y1={e.sourceY}
            x2={e.targetX}
            y2={e.targetY}
            stroke={t.stroke.primary}
            strokeWidth={1.25}
            strokeDasharray={e.isBackEdge ? '4 3' : undefined}
            markerEnd="url(#crmArrow)"
            opacity={0.75}
          />
        ))}
        {layout.nodes.map((n) => {
          const accent = accentIds.has(n.id);
          const lines = (NODE_LABEL[n.id] || n.id).split('\\n');
          return (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={132}
                height={48}
                rx={6}
                fill={accent ? t.fill.secondary : t.fill.primary}
                stroke={accent ? t.accent.primary : t.stroke.secondary}
                strokeWidth={accent ? 1.5 : 1}
              />
              {lines.map((line, i) => (
                <text
                  key={i}
                  x={n.x + 66}
                  y={n.y + 20 + i * 13}
                  textAnchor="middle"
                  fill={t.text.primary}
                  fontSize={10}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <Text size="small" tone="tertiary">
        Source: backend/src/routes/crm · DAG layout · 2026-07-16
      </Text>
    </Stack>
  );
}

function TestSuiteTable({ cases }: { cases: Array<{ id: number; name: string }> }) {
  return (
    <Table
      headers={['#', 'Ten truong hop']}
      columnAlign={['right', 'left']}
      rows={cases.map((c) => [String(c.id).padStart(3, '0'), c.name])}
    />
  );
}

export default function CrmSplitReportCanvas() {
  const { tokens: t } = useHostTheme();
  const totalCases = TESTS_A.length + TESTS_B.length + TESTS_UI.length;

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={6}>
        <H1>Bao cao tach CRM routes</H1>
        <Text tone="secondary">
          Monolith crm.js (~17.358 dong) duoc tach thanh composition root, 14 feature modules va
          shared helpers. Khong doi URL, middleware chain, hay API contract.
        </Text>
        <Row gap={8} wrap>
          <Pill active>Test A 50/50</Pill>
          <Pill active>Test B 50/50</Pill>
          <Pill active>UI 100 cases</Pill>
          <Pill active>224 endpoints</Pill>
          <Pill>2026-07-16</Pill>
        </Row>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="1 → 23" label="File entry → tree CRM" tone="info" />
        <Stat value="224" label="Endpoint giu nguyen" />
        <Stat value="14" label="Feature routers" />
        <Stat value={String(totalCases)} label="Tong truong hop test" tone="success" />
      </Grid>

      <Callout tone="info" title="Nguyen tac an toan">
        Mot composition root giu auth + cache invalidate + enforceCrmDealAssigneeAccess. Thin
        re-export crm.js → crm/index.js. Van export computeOrgOverviewReportData cho AI helper.
      </Callout>

      <Divider />
      <ArchitectureDag />
      <Divider />

      <Stack gap={10}>
        <H2>Kich thuoc module (dong code)</H2>
        <BarChart
          categories={BAR_CATS}
          series={[{ name: 'Dong code', data: BAR_LINES, tone: 'info' }]}
          height={280}
          horizontal
          beginAtZero
        />
        <Text size="small" tone="tertiary">
          Metric: dong file · Source: backend/src/routes/crm/routes · 2026-07-16
        </Text>
      </Stack>

      <Stack gap={10}>
        <H2>So endpoint theo cum</H2>
        <BarChart
          categories={BAR_CATS}
          series={[{ name: 'So route HTTP', data: BAR_ROUTES, tone: 'success' }]}
          height={240}
          horizontal
          beginAtZero
        />
        <Text size="small" tone="tertiary">
          Metric: method+path Express · Source: route-manifest.json (224) · 2026-07-16
        </Text>
      </Stack>

      <Card>
        <CardHeader trailing={<Pill size="sm">14 modules</Pill>}>Chi tiet cum chuc nang</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <Table
            headers={['Module', 'Routes', 'Dong', 'Vai tro']}
            columnAlign={['left', 'right', 'right', 'left']}
            rows={MODULE_ROWS.map((r) => [r.module, String(r.routes), String(r.lines), r.role])}
            rowTone={MODULE_ROWS.map((r) =>
              r.module === 'leadLifecycle' ? ('warning' as const) : undefined,
            )}
          />
        </CardBody>
      </Card>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Truoc</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Stat value="~17.358" label="Dong crm.js monolith" />
              <Text size="small" tone="secondary">
                1 file: middleware + helpers + 224 handler cung closure.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Sau</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Stat value="~3.085" label="File lon nhat (leadLifecycle)" tone="success" />
              <Text size="small" tone="secondary">
                Entry 2 dong; index 134; helpersBundle ~6.188; 14 routers theo cum.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Stack gap={12}>
        <H2>Tong hop kiem thu</H2>
        <Table
          headers={['Bo', 'File', 'Case', 'Ket qua', 'Pham vi']}
          columnAlign={['left', 'left', 'right', 'left', 'left']}
          rows={[
            ['A', 'crm-split-50-cases.js', '50', 'PASS 50/50', 'Cau truc + registry = bak + HTTP chinh'],
            ['B', 'crm-split-50-cases-b.js', '50', 'PASS 50/50', 'Shadow path, manifest, endpoint phu'],
            ['UI', 'crm-split-100-ui.js', '100', 'UI+API+Playwright', 'Trang giao dien CRM map module tach'],
          ]}
          rowTone={['success', 'success', 'info']}
        />
        <Text size="small" tone="tertiary">
          Lenh: npm run test:crm-split / test:crm-split:b / test:crm-split:ui (can CRM_TEST_TOKEN +
          Playwright cho UI)
        </Text>
      </Stack>

      <Stack gap={8}>
        <H2>Danh muc day du {totalCases} truong hop test</H2>
        <Text size="small" tone="secondary">
          Mo tung bo de xem toan bo ten case. Bo A/B kiem backend sau tach; bo UI kiem giao dien
          frontend goi dung module.
        </Text>

        <CollapsibleSection title="Bo A — Backend cau truc + HTTP chinh" count={TESTS_A.length} defaultOpen>
          <TestSuiteTable cases={TESTS_A} />
        </CollapsibleSection>

        <CollapsibleSection title="Bo B — Backend canh bien + endpoint phu" count={TESTS_B.length}>
          <TestSuiteTable cases={TESTS_B} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Bo UI — Giao dien + API map trang CRM (Playwright)"
          count={TESTS_UI.length}
          defaultOpen
        >
          <Stack gap={8}>
            <Text size="small" tone="secondary">
              01–20 cau truc map UI↔module · 21–55 API contract tung trang · 56–100 Playwright mo
              trang that, bat network /api/crm, console error.
            </Text>
            <TestSuiteTable cases={TESTS_UI} />
          </Stack>
        </CollapsibleSection>
      </Stack>

      <Stack gap={8}>
        <H2>Thu tu mount (quan trong)</H2>
        <Text size="small">
          dashboard → reports → pipelines → taxonomy → leadDuplicates → leadsList → customers →
          commercialDocs → taskTemplates → crmTasks → followupPlanner → leadComments → membersChat →
          leadLifecycle (cuoi)
        </Text>
        <Callout tone="warning" title="Vi sao leadLifecycle cuoi?">
          Express match theo thu tu dang ky. Path tinh /leads/picker, /leads/scan-duplicates phai
          dang ky truoc /leads/:id.
        </Callout>
      </Stack>

      <Spacer height={8} />
      <Divider />
      <Text size="small" tone="tertiary" style={{ color: t.text.tertiary }}>
        Bao cao tach CRM · {totalCases} test cases · backend/src/routes/crm · 2026-07-16
      </Text>
    </Stack>
  );
}
`;

fs.writeFileSync(outPath, body);
console.log('Wrote', outPath, 'bytes', body.length);
