/**
 * Toàn bộ CopilotKit v2 (nặng ~ vài trăm KB gzip) — `lazy()` load khi bấm nút ✨, xem
 * AppGuideCopilot.jsx. Đóng panel → unmount hoàn toàn.
 *
 * Showcase đủ 5 khả năng chính của CopilotKit (xem thảo luận trong docs/):
 *  - Chat UI          : <CopilotSidebar position="right" /> — dán mép phải, không phải popup nổi
 *  - Shared state      : useAgentContext (màn hình đang xem, cấu trúc giao diện, user, mục lục)
 *  - Actions           : tool backend `search_knowledge_base` + tool client `highlight_button`,
 *                        `read_screen_metrics` (đọc số liệu tổng hợp ĐANG HIỂN THỊ,
 *                        lọc PII 3 lớp — xem lib/screenMetrics.js)
 *  - Generative UI     : useRenderTool — kết quả tool vẽ thành thẻ màn hình, không phải JSON thô
 *  - Human-in-the-loop : useHumanInTheLoop cho `navigate_to_page` — agent chỉ ĐỀ NGHỊ,
 *                        chỉ điều hướng thật khi người dùng bấm "Đồng ý" trong khung chat.
 *
 * PHẠM VI — hai chế độ, chọn bằng cờ ở lib/guideAccess.js:
 *
 *  ĐỌC (mặc định khi build production): chỉ đọc khung giao diện + số liệu tổng hợp đang hiển
 *  thị (lọc PII 3 lớp), điều hướng phải người dùng bấm xác nhận. Không action nào ghi/sửa/xoá.
 *
 *  TOÀN QUYỀN (mặc định khi chạy dev): thêm `read_page_state`, `click_element`, `fill_field` và điều
 *  hướng KHÔNG cần xác nhận. Trợ lý làm được đúng những gì người dùng làm được bằng chuột trên
 *  trang đó — kể cả bấm Xoá. Không lọc PII, vì nó chỉ đọc cái người dùng đang tự nhìn thấy.
 *  Chế độ này dành cho bản thử nghiệm; xem lib/guideAccess.js cho lý do phải có công tắc.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useFrontendTool,
  useHumanInTheLoop,
  useRenderTool,
} from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';
import { useAuth } from '../../lib/auth';
import { resolveApiOrigin } from '../../lib/apiOrigin';
import api from '../../lib/api';
import { MODULE_INDEX } from './data/screenRegistry';
import { describeScreen } from './lib/matchScreen';
import { scanPageStructure } from './lib/pageStructureScanner';
import { highlightByLabel } from './lib/uiSpotlight';
import { readScreenMetrics } from './lib/screenMetrics';
import { attachReasoningAutoScroll } from './lib/reasoningAutoScroll';
import { FULL_ACCESS } from './lib/guideAccess';
import { TOOL } from './lib/toolRegistry';
import { readPageState, readFilterSnapshot, searchOnPage } from './lib/pageState';
import { scanRegions } from './lib/pageRegions';
import { REGION_MAP_CONTEXT, runReadRegion, runHighlightRegion } from './lib/regionTools';
import { tourForPath, openTour, closeGuideTour } from './lib/pageTour';
import { clickByLabel, setFieldByLabel, waitAfterNavigate } from './lib/pageActions';
import { waitForPageReady, waitNote } from './lib/pageReady';
import { isNavigablePath } from './lib/matchScreen';
import {
  SearchResultCard,
  NavProposalCard,
  PointAtButtonCard,
  PointAtRegionCard,
  ReadMetricsCard,
  ReadPageCard,
  ClickResultCard,
  FillFieldCard,
  NavDoneCard,
  FindOnPageCard,
  ReadRegionCard,
  OpenTourCard,
} from './GuideToolStep';
import AgentActivityPanel from './AgentActivityPanel';
import GuideMascot from './GuideMascot';
import { loadMascotSet } from './lib/useMascotSet';
import GuideAskBridge from './GuideAskBridge';
import GuideExperienceRecorder from './GuideExperienceRecorder';
import GuideChatPersist from './GuideChatPersist';
import GuideChatLog from './GuideChatLog';

const SCAN_INTERVAL_MS = 4000;
/**
 * Bề ngang sidebar. KHÔNG export: bảng hành động tự ĐO rect thật của sidebar thay vì dùng lại
 * hằng số này — đo thì đúng cả khi thư viện tự kẹp bề ngang theo viewport (màn hẹp).
 */
const SIDEBAR_W = 420;

/**
 * Bọc handler của tool client — KHÔNG BAO GIỜ để nó ném lỗi ra ngoài.
 *
 * Vì sao bắt buộc: `CopilotKitCore.executeSpecificTool` (@copilotkit/core, dist/index.mjs)
 * chỉ yêu cầu chạy lượt tiếp theo khi handler KHÔNG lỗi:
 *     if (!handlerResult.error && tool?.followUp !== false) return true;  // needsFollowUp
 * Handler ném lỗi — hoặc arguments không parse được JSON — thì `needsFollowUp` = false,
 * `processAgentResult` bỏ luôn `runAgent()`, nên agent KHÔNG bao giờ được gọi lại. Người dùng
 * thấy đúng khung 💭 suy luận rồi trợ lý im bặt: không câu trả lời, không cả thông báo lỗi
 * (lỗi chỉ đi vào `emitError` nội bộ của thư viện).
 *
 * Đã tái hiện: cho handler `highlight_button` ném lỗi → lượt chat chết hẳn, KHÔNG có request
 * thứ hai nào tới /api/copilotkit. Trả về object lỗi thay vì ném → model nhận được kết quả,
 * lượt tiếp theo vẫn chạy và trợ lý vẫn nói được với người dùng.
 */
function guardTool(name, handler) {
  return async (args, ctx) => {
    try {
      return await handler(args, ctx);
    } catch (e) {
      console.error(`[guide] tool ${name} lỗi:`, e);
      return { ok: false, reason: 'tool_error', loi: e?.message || String(e) };
    }
  };
}

/**
 * THAM SỐ CHUNG của `navigate_to_page` — MỘT tên tool, HAI định nghĩa (xem lib/toolRegistry.js):
 * `GuideNavConfirmTool` (chế độ đọc, có cổng xác nhận) và `GuideFullAccessTools` (chuyển NGAY).
 * Hai nhánh loại trừ nhau theo `FULL_ACCESS` nên không trùng đăng ký, nhưng model chỉ thấy MỘT
 * tên — tham số buộc phải y hệt nhau. Trước đây hai chỗ chép tay cùng một `z.object`, sửa một
 * chỗ là lệch âm thầm. `description` thì CỐ Ý để riêng: hai chế độ hứa với model hai việc khác
 * nhau (đề nghị vs. chuyển ngay).
 */
const NAV_PARAMS = z.object({
  path: z.string().describe('Đường dẫn tuyệt đối trong hệ thống, ví dụ "/crm/quotations".'),
});

function GuideCopilotTools() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [structure, setStructure] = useState(() => scanPageStructure());
  // LỚP 1 của ngữ cảnh hai lớp — bản đồ khu vực. Xem lib/pageRegions.js.
  const [regions, setRegions] = useState(() => scanRegions());

  // Quét lại cấu trúc giao diện định kỳ — người dùng có thể đổi TAB trong cùng một trang mà
  // URL không đổi. useAgentContext tự so sánh nội dung (JSON string) trước khi đăng ký lại
  // context với runtime, nên poll ở đây không gây churn nếu màn hình đứng yên.
  useEffect(() => {
    const scan = () => { setStructure(scanPageStructure()); setRegions(scanRegions()); };
    scan();
    const id = setInterval(scan, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pathname]);

  // `page_tour` gộp vào ĐÂY chứ không làm readable riêng: readable riêng phải trả
  // thêm phần `description` ở mọi lượt kể cả trang không có tour. Gộp vào readable sẵn có thì
  // trang không có tour tốn đúng 0 ký tự (trường `undefined` không được serialize).
  const screen = useMemo(() => ({
    ...describeScreen(pathname),
    page_tour: tourForPath(pathname),
  }), [pathname]);
  const now = new Date();

  // Khung 💭 suy luận: giữ trong hộp cố định + tự cuộn xuống đáy khi stream, xem
  // lib/reasoningAutoScroll.js cho lý do phải làm bằng DOM thuần.
  useEffect(() => attachReasoningAutoScroll(), []);

  // ── Shared state: 4 readable gửi lên model mỗi lượt hỏi ──
  useAgentContext({
    description: 'Ngày giờ hiện tại (múi giờ Việt Nam)',
    value: now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
  });
  useAgentContext({
    description: 'Màn hình người dùng đang xem',
    value: screen,
  });
  useAgentContext({
    description: 'Cấu trúc giao diện đang hiển thị trên màn hình (tab/nút/trường) — KHÔNG chứa dữ liệu khách hàng',
    value: structure,
  });
  // LỚP 1 — bản đồ khu vực. Đứng cạnh "Cấu trúc giao diện" chứ không thay thế: cái kia là DANH
  // SÁCH PHẲNG tên nút/tab/trường, cái này là PHÂN VÙNG (khu nào chứa bản ghi, chứa bao nhiêu).
  // Chi tiết bên trong một khu vực phải gọi tool `read_region` — xem lib/pageRegions.js.
  useAgentContext({
    // Hằng chung với bảng Hành động — bảng nhận ra bản đồ khu vực bằng ĐÚNG chuỗi này.
    description: REGION_MAP_CONTEXT,
    value: regions,
  });
  useAgentContext({
    description: 'Người dùng đang trò chuyện',
    value: {
      name: user?.fullName || user?.full_name || user?.name || '',
      role: user?.role || '',
      is_admin: ['admin', 'sales_admin', 'platform_admin'].includes(user?.role),
    },
  });
  useAgentContext({
    description: 'Mục lục module của hệ thống — CHỈ để biết cái gì tồn tại, chi tiết phải gọi tool search_knowledge_base',
    value: MODULE_INDEX,
  });
  // Chỉ dẫn hệ thống rẽ nhánh theo readable này (xem helpers/guidePrompt.js § "Chế độ toàn
  // quyền"): một prompt duy nhất, hành vi đổi theo quyền client thật sự đang cấp.
  /**
   * Nhãn nói "trong phiên này", KHÔNG phải "trên trang này".
   *
   * Nhãn cũ sai theo một cách khó thấy: giá trị này là một object CỨNG, chọn bằng `FULL_ACCESS`
   * — một hằng build-time đọc từ biến môi trường lúc dựng bundle. Nó không đổi khi người dùng
   * sang trang khác, không đổi theo vai trò, không đổi giữa chừng phiên làm việc. Chữ "trên
   * trang này" khiến cả model lẫn người đọc bảng Ngữ cảnh tưởng quyền được cấp theo từng màn
   * hình, rồi đi tìm một cơ chế phân quyền theo trang vốn không tồn tại.
   */
  useAgentContext({
    description: 'Quyền của bạn (trợ lý) trong phiên này — do bản triển khai quyết định, không đổi theo trang',
    value: FULL_ACCESS
      ? {
        full_access: true,
        can_click_buttons: true,
        can_fill_fields: true,
        can_navigate_without_confirm: true,
        can_read_visible_data: true,
        note: 'Bản thử nghiệm — chủ hệ thống đã cho phép thao tác thật, kể cả xoá dữ liệu.',
      }
      : {
        full_access: false,
        can_click_buttons: false,
        can_fill_fields: false,
        can_navigate_without_confirm: false,
        can_read_visible_data: false,
      },
  });

  // ── Generative UI: vẽ lại kết quả tool search_knowledge_base thành thẻ màn hình ──
  useRenderTool({
    name: TOOL.search_knowledge_base,
    parameters: z.object({ question: z.string() }),
    render: ({ status, result }) => <SearchResultCard status={status} result={result} />,
  }, []);

  // ── Action (client, an toàn — chỉ làm sáng nút, không điều hướng) ──
  useFrontendTool({
    name: TOOL.highlight_button,
    description: 'Làm sáng (spotlight) một nút/tab đang hiển thị TRÊN MÀN HÌNH HIỆN TẠI theo nhãn. Không điều hướng. Dùng khi người dùng đã ở đúng trang và chỉ cần biết bấm nút nào.',
    parameters: z.object({
      label: z.string().describe('Nhãn hiển thị chính xác của nút, ví dụ "Thêm Lead", "Lưu".'),
    }),
    handler: guardTool(TOOL.highlight_button, async ({ label }) => {
      const r = await highlightByLabel(label);
      if (r.ok) return { ok: true };
      const visible = [...structure.buttons, ...structure.tabs];
      return { ok: false, reason: 'label_not_found', visible: visible };
    }),
    render: ({ args, status, result }) => <PointAtButtonCard args={args} status={status} result={result} />,
  }, []);

  /**
   * ── CHỈ VÀO MỘT KHU VỰC — người anh em của `highlight_button` ──
   *
   * Hai tool vì màn hình có hai loại "chỗ", và trước đây trợ lý chỉ có tay cho một loại. Câu hỏi
   * "nút Tạo sự kiện ở đâu" có một phần tử để khoanh; câu hỏi "thông tin deadline nằm ở đâu"
   * KHÔNG — deadline là mấy dòng chữ trong cột Thông tin. Thiếu tool này thì model buộc phải tả
   * bằng lời ("ở khu vực Thông tin, bên phải màn hình") trong lúc nhân vật vẫn đứng ở góc trái:
   * chữ chỉ một đằng, ngón tay chỉ một nẻo.
   *
   * Tên khu vực lấy từ bản đồ LỚP 1 vốn đã nằm sẵn trong ngữ cảnh mỗi lượt, nên model không phải
   * gọi thêm tool nào trước khi chỉ.
   */
  useFrontendTool({
    name: TOOL.highlight_region,
    description: 'Khoanh sáng cả một KHU VỰC trên màn hình hiện tại và cho nhân vật chỉ tay vào đó. Dùng khi người dùng hỏi "… nằm ở đâu / ở khu vực nào" mà thứ họ hỏi KHÔNG phải một nút bấm (một cụm thông tin, một cột, một bảng) — nếu là nút thì dùng highlight_button. Truyền `name` khu vực lấy từ "Bản đồ KHU VỰC" trong ngữ cảnh, hoặc id dạng "kv2". Luôn gọi tool này thay vì chỉ mô tả vị trí bằng lời.',
    parameters: z.object({
      region: z.string().describe('Tên khu vực lấy từ bản đồ lớp 1, ví dụ "Thông tin"; hoặc id "kv2".'),
    }),
    // Cùng hàm với nút "Chỉ vị trí" trong bảng Hành động — xem lib/regionTools.js.
    handler: guardTool(TOOL.highlight_region, async ({ region }) => runHighlightRegion({ region })),
    render: ({ args, status, result }) => <PointAtRegionCard args={args} status={status} result={result} />,
  }, []);

  // ── Action (client, đọc CHỈ SỐ TỔNG HỢP đang hiển thị — không phải nội dung/PII) ──
  useFrontendTool({
    name: TOOL.read_screen_metrics,
    description: 'Đọc các chỉ số/con số tổng hợp đang hiển thị TRÊN MÀN HÌNH HIỆN TẠI (ví dụ "Kênh Facebook: 3", "Leads 4.188", "Quá hạn 12"). Dùng khi người dùng hỏi về SỐ LƯỢNG/thống kê. Chỉ đọc được số liệu ĐANG HIỂN THỊ theo bộ lọc hiện tại của trang, không phải tổng toàn hệ thống — nếu không chắc câu hỏi khớp màn hình nào, hãy dùng search_knowledge_base trước để biết nên điều hướng tới đâu.',
    parameters: z.object({}),
    handler: guardTool(TOOL.read_screen_metrics, async () => {
      // Chờ trước khi đọc: tool này hay được gọi NGAY SAU điều hướng, và đọc lúc trang còn
      // skeleton thì ra 0 chỉ số — model tưởng "trang không có số liệu" và nói sai.
      const waited = await waitForPageReady({ minMs: 0, maxMs: 6000 });
      const items = readScreenMetrics();
      if (items.length === 0) {
        return {
          metrics: [],
          page_wait: waited,
          note: `Không đọc được chỉ số nào trên màn hình này. ${waitNote(waited)}`,
        };
      }
      return {
        metrics: items,
        page_wait: waited,
        note: `Số liệu đang hiển thị theo bộ lọc hiện tại của trang, không phải tổng toàn hệ thống. ${waitNote(waited)}`,
      };
    }),
    render: ({ status, result }) => <ReadMetricsCard status={status} result={result} />,
  }, []);

  // ── LỚP 2 của ngữ cảnh hai lớp — khoan sâu ĐÚNG một khu vực trong bản đồ lớp 1 ──
  //
  // Đăng ký ở đây (không phải trong GuideFullAccessTools) để CẢ HAI chế độ đều có. Ranh giới dữ
  // liệu nằm bên trong `readRegion`: chế độ chỉ hướng dẫn trả về SỐ LƯỢNG mục, chế độ toàn quyền
  // mới trả về tiêu đề từng mục. Nhờ vậy bản production vẫn trả lời được "khu vực Deals đang có
  // bao nhiêu thẻ" mà tên khách hàng không rời hệ thống.
  useFrontendTool({
    name: TOOL.read_region,
    description: 'Đọc SÂU một khu vực trên màn hình hiện tại. Trả về: `controls` (ô nhập/bộ lọc kèm giá trị thật), `fields` (thông tin hiển thị dạng chữ — trạng thái, ngày, người phụ trách, tổng tiền…), `table` (tiêu đề cột + các dòng), `active_tab`, `buttons`, `items` và `lists`. Dùng SAU KHI đã nhìn "Bản đồ KHU VỰC" trong ngữ cảnh — truyền `name` của khu vực (ưu tiên) hoặc `id` dạng "kv2". Đây là cách đúng để trả lời "trong khu vực này có gì", thay vì đọc cả trang. Trường nào KHÔNG có trong kết quả nghĩa là khu vực đó không có, đừng suy đoán.',
    parameters: z.object({
      region: z.string().describe('Tên khu vực lấy từ bản đồ lớp 1, ví dụ "Deals"; hoặc id "kv2".'),
      include_items: z.boolean().optional().describe('true (mặc định) để đọc cả danh sách mục bên trong; false nếu chỉ cần bộ lọc và nút, đỡ tốn token.'),
    }),
    // Cùng hàm với nút "Chi tiết" trong bảng Hành động: người dùng bấm thấy gì thì trợ lý nhận
    // đúng như vậy. Chờ trang sẵn sàng cũng nằm trong hàm đó — xem lib/regionTools.js.
    handler: guardTool(TOOL.read_region, async ({ region, include_items }) => runReadRegion({ region, include_items })),
    render: ({ args, status, result }) => <ReadRegionCard args={args} status={status} result={result} />,
  }, []);

  // ── Mở HƯỚNG DẪN CÓ SẴN trong giao diện (product tour) — cả hai chế độ ──
  //
  // Có ở chế độ đọc là cố ý: nó chỉ mở một lớp hướng dẫn phủ lên màn hình, không sửa gì, không
  // gửi gì đi. Và đây đúng là việc của chế độ đọc — chỉ đường bằng thứ người làm sản phẩm đã
  // viết sẵn, thay vì để model tự mô tả lại màn hình bằng lời.
  useFrontendTool({
    name: TOOL.open_page_tour,
    description: 'Mở HƯỚNG DẪN TỪNG BƯỚC dựng sẵn trong giao diện cho màn hình hiện tại, nhảy tới bước liên quan nhất. Dùng NGAY khi người dùng hỏi cách dùng / cách làm / một phần trên màn hình để làm gì, VÀ ngữ cảnh "Màn hình người dùng đang xem" có `page_tour`. Ưu tiên tool này hơn là tự mô tả bằng lời.',
    parameters: z.object({
      keyword: z.string().optional().describe('Điều người dùng đang hỏi, để nhảy đúng bước — ví dụ "thanh tiêu đề", "thành viên", "tạo sự kiện". Bỏ trống thì mở ở bước hợp với trang hiện tại.'),
    }),
    handler: guardTool(TOOL.open_page_tour, async ({ keyword }) => openTour(keyword)),
    render: ({ args, status, result }) => <OpenTourCard args={args} status={status} result={result} />,
  }, []);

  // ── Lưới an toàn: model gọi tên tool KHÔNG tồn tại ──
  // `processAgentResult` (@copilotkit/core) chỉ chạy lượt tiếp theo khi tìm được tool khớp tên,
  // hoặc tool tên "*". Không có cả hai → thư viện KHÔNG chèn tool result và KHÔNG gọi lại
  // agent: lượt chat chết im lặng, VÀ lịch sử còn lại một tool call không có kết quả nên lượt
  // sau cũng lỗi. Tool "*" hứng mọi tên lạ, trả về lời giải thích để model tự sửa.
  //
  // `available: false` để tool này KHÔNG nằm trong danh sách tool gửi cho model
  // (`buildFrontendTools` lọc theo cờ đó) — tên "*" không hợp lệ với Anthropic, gửi lên là 400.
  // `getTool()` thì không xét cờ này, nên nó vẫn dùng được làm lưới hứng. Nếu bản CopilotKit
  // sau đổi `getTool` để xét `available`, lưới này ngừng tác dụng — quay về đúng hành vi hiện
  // tại của thư viện, không gây hỏng thêm.
  useFrontendTool({
    name: '*',
    available: false,
    description: 'Lưới an toàn nội bộ — không dành cho model gọi.',
    parameters: z.object({}),
    handler: guardTool('*', async ({ toolName }) => ({
      ok: false,
      reason: 'tool_not_found',
      note: `Hệ thống không có tool "${toolName}". Nói thật với người dùng và chỉ dùng tool có sẵn.`,
    })),
  }, []);

  return null;
}

/**
 * Điều hướng CÓ CỔNG XÁC NHẬN — chế độ đọc. Agent chỉ ĐỀ NGHỊ, chỉ khi con người bấm "Đồng ý"
 * mới thật sự chuyển trang.
 */
function GuideNavConfirmTool() {
  useHumanInTheLoop({
    name: TOOL.navigate_to_page,
    description: 'Đề nghị điều hướng người dùng sang một trang khác trong hệ thống. Chỉ gọi SAU KHI người dùng đã đồng ý bằng lời trong hội thoại (xem quy tắc 3 nhịp). Việc điều hướng thật chỉ xảy ra khi người dùng bấm nút xác nhận trong khung chat.',
    parameters: NAV_PARAMS,
    render: (props) => <NavProposalCard {...props} />,
  }, []);

  return null;
}

/**
 * Nhóm tool CHẾ ĐỘ TOÀN QUYỀN — mount thay cho `GuideNavConfirmTool` khi cờ bật.
 *
 * Tách thành component riêng, KHÔNG gọi hook trong `if`: `FULL_ACCESS` là hằng đọc một lần lúc
 * import nên nhánh mount không đổi giữa các lần render, còn hook bên trong mỗi component thì
 * luôn chạy đủ và đúng thứ tự. Gộp vào một component rồi bọc `if` quanh hook là cách nhanh
 * nhất để React ném "Rendered fewer hooks than expected" ngay lần đổi cờ đầu tiên.
 *
 * Ba tool tổng quát (đọc trang / bấm / điền) thay vì tool riêng cho từng nghiệp vụ: mọi việc
 * người dùng làm bằng chuột đều là tổ hợp của ba việc này, nên không phải viết và bảo trì tool
 * cho ~200 màn hình, và không bao giờ lệch với giao diện thật.
 */
function GuideFullAccessTools() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [snapshot, setSnapshot] = useState(() => readFilterSnapshot());

  // Giá trị bộ lọc gửi lên MỖI LƯỢT, không đợi model gọi tool: "bộ lọc này đang lọc của công ty
  // nào" là câu hỏi rất hay gặp, và trước đây model trả lời trượt vì ngữ cảnh chỉ có TÊN trường
  // chứ không có GIÁ TRỊ. Bản gọn này không kèm bảng dữ liệu nên không phình token.
  useEffect(() => {
    setSnapshot(readFilterSnapshot());
    const id = setInterval(() => setSnapshot(readFilterSnapshot()), SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pathname]);

  useAgentContext({
    description: 'Giá trị THẬT của bộ lọc / ô nhập đang hiển thị trên màn hình (dùng để trả lời “bộ lọc đang lọc gì”)',
    value: snapshot,
  });

  useFrontendTool({
    name: TOOL.read_page_state,
    description: 'Đọc trạng thái THẬT của màn hình hiện tại: giá trị từng bộ lọc/ô nhập, tab đang chọn, danh sách nút bấm được, danh sách THẺ BẢN GHI MỞ ĐƯỢC (`openable_cards` — thẻ lead/deal, dòng bảng, dòng danh sách), danh sách mục CHỈ ĐỌC không bấm được (`readonly_items`), và bảng dữ liệu đang hiển thị (tối đa 25 dòng đầu). QUAN TRỌNG: các danh sách đều bị CẮT NGẮN — luôn đọc `openable_cards_total` và `clickable_buttons_total` để biết con số THẬT, và đừng bao giờ kết luận "trang chỉ có N bản ghi" từ danh sách đã cắt. Gọi khi cần biết màn hình đang lọc gì, đang hiện dữ liệu gì, muốn biết có thể mở bản ghi nào, hoặc để xem kết quả CUỐI CÙNG sau khi đã làm XONG hết các thao tác. Đừng gọi sau MỖI lần bấm/điền: kết quả của `click_element`/`fill_field` đã báo thành công hay không, và `fill_field` còn trả về `current_value` đọc lại từ màn hình.',
    parameters: z.object({
      include_table: z.boolean().optional().describe('true (mặc định) để đọc cả bảng dữ liệu; false nếu chỉ cần bộ lọc, đỡ tốn token.'),
    }),
    handler: guardTool(TOOL.read_page_state, async ({ include_table }) => {
      const waited = await waitForPageReady({ minMs: 0, maxMs: 6000 });
      const state = readPageState({ include_table: include_table !== false });
      return { ...state, page_wait: waited, note: `${state.note || ''} ${waitNote(waited)}`.trim() };
    }),
    render: ({ status, result }) => <ReadPageCard status={status} result={result} />,
  }, []);

  useFrontendTool({
    name: TOOL.find_on_page,
    description: 'Tìm GẦN ĐÚNG một từ khoá trong nội dung đang hiển thị trên trang (bỏ dấu, khớp một phần). Dùng khi ô tìm kiếm của trang trả về 0 hoặc khi cần tìm theo TÊN NGƯỜI / chuỗi nằm trong nội dung mà ô tìm kiếm của trang không phủ (ví dụ tên người phụ trách trong danh sách sự kiện). Trả về từng khối bản ghi có chứa từ khoá.',
    parameters: z.object({
      keyword: z.string().describe('Chuỗi cần tìm, không cần dấu và không cần đúng hoa thường, ví dụ "linh".'),
    }),
    handler: guardTool(TOOL.find_on_page, async ({ keyword }) => {
      const waited = await waitForPageReady({ minMs: 0, maxMs: 6000 });
      return { ...searchOnPage(keyword), page_wait: waited };
    }),
    render: ({ args, status, result }) => <FindOnPageCard args={args} status={status} result={result} />,
  }, []);

  useFrontendTool({
    name: TOOL.click_element,
    description: 'BẤM THẬT một nút / tab / liên kết, HOẶC một thẻ bản ghi (thẻ lead/deal trên kanban, dòng trong bảng) để MỞ CHI TIẾT bản ghi đó — theo nhãn hoặc tiêu đề. Đây là hành động thật, có thể lưu hoặc xoá dữ liệu. Muốn mở một lead/deal thì truyền TIÊU ĐỀ của thẻ (xem `openable_cards` trong kết quả read_page_state), đừng truyền số điện thoại. Nếu không tìm thấy, kết quả trả về danh sách nhãn và tiêu đề thẻ đang hiển thị để bạn chọn lại.',
    parameters: z.object({
      label: z.string().describe('Nhãn nút ("Áp dụng", "Lưu", "Xoá") hoặc tiêu đề thẻ bản ghi ("Tủ bếp Chị Nhật Linh").'),
    }),
    handler: guardTool(TOOL.click_element, async ({ label }) => clickByLabel(label)),
    render: ({ args, status, result }) => <ClickResultCard args={args} status={status} result={result} />,
  }, []);

  useFrontendTool({
    name: TOOL.fill_field,
    description: 'Đặt giá trị THẬT cho một trường đang hiển thị: ô nhập, ô chọn (dropdown), hoặc ô tích. Với ô chọn thì `value` là NHÃN của lựa chọn (ví dụ "Công Ty Metalla"); với ô tích thì dùng "có"/"không". Không tìm thấy trường hoặc lựa chọn thì kết quả kèm danh sách đang có.',
    parameters: z.object({
      label: z.string().describe('Nhãn của trường, ví dụ "Công ty", "Từ ngày", "Tìm kiếm".'),
      value: z.string().describe('Giá trị cần đặt. Chuỗi rỗng "" để xoá trắng ô nhập / bỏ chọn.'),
    }),
    handler: guardTool(TOOL.fill_field, async ({ label, value }) => setFieldByLabel(label, value)),
    render: ({ args, status, result }) => <FillFieldCard args={args} status={status} result={result} />,
  }, []);

  useFrontendTool({
    name: TOOL.navigate_to_page,
    description: 'Chuyển người dùng sang một trang khác trong hệ thống NGAY, không cần xác nhận. Sau khi chuyển, trang mới có thể còn đang nạp — muốn đọc số liệu ở đó thì gọi tiếp read_page_state hoặc read_screen_metrics.',
    parameters: NAV_PARAMS,
    handler: guardTool(TOOL.navigate_to_page, async ({ path }) => {
      // Vẫn chặn đường dẫn không có trong sổ đăng ký màn hình: điều hướng bừa chỉ dẫn tới trang
      // 404, và model sẽ tưởng tính năng đó không tồn tại.
      if (!isNavigablePath(path)) {
        return { ok: false, reason: 'path_not_found', note: 'Tra cứu bằng search_knowledge_base để lấy đúng path.' };
      }
      // Dẹp tour do chính trợ lý mở trước khi rời trang — xem `closeGuideTour`.
      closeGuideTour();
      navigate(path);
      const waited = await waitAfterNavigate();
      return { ok: true, path: path, page_wait: waited, note: waitNote(waited) };
    }),
    render: ({ args, status, result }) => <NavDoneCard args={args} status={status} result={result} />,
  }, []);

  return null;
}

/**
 * BĂNG BÁO KHI MỘT LƯỢT HỎI KHÔNG RA CÂU TRẢ LỜI.
 *
 * Vì sao cần một băng riêng thay vì để lỗi tự hiện: từ phía client thì "hết lượt", "nhà cung cấp
 * model lỗi" và "trợ lý hỏng" trông y hệt nhau — luồng SSE đứt, không có gì trong khung chat.
 * Người dùng sẽ bấm hỏi lại vài lần rồi đi báo lỗi.
 *
 * HAI LOẠI, PHÂN BIỆT BẰNG `title`:
 *  · hết hạn mức — server trả 429 kèm thân JSON đủ số liệu, nói được chính xác;
 *  · lỗi khác   — nói ĐÚNG mức mình biết ("không nhận được câu trả lời"), KHÔNG đoán nguyên
 *                 nhân. Bản trước im lặng hoàn toàn ở nhánh này, và đó chính là cái làm người
 *                 dùng tưởng trợ lý chết: nhà cung cấp model trả 500, retry 3 lần rồi bỏ, mà
 *                 trên màn hình không có một chữ nào.
 */
function QuotaBanner({ message, title = 'Hết lượt hỏi hôm nay', icon = '⏳', onClose }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-24 right-4 z-[60] max-w-sm rounded-xl border border-amber-300
                 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-none">{icon}</span>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <p className="mt-0.5 leading-snug">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="text-amber-700 hover:text-amber-900 cursor-pointer leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function AppGuideCopilotPanel() {
  const { user } = useAuth();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const runtimeUrl = `${resolveApiOrigin()}/api/copilotkit`;
  const [notice, setNotice] = useState(null);

  // Hỏi máy chủ bộ nhân vật đang bật — một lần cho cả phiên, xem `useMascotSet.js`.
  useEffect(() => { loadMascotSet(); }, []);

  /**
   * Không khai `onError` thì mọi lỗi tool/agent chỉ nằm im trong `emitError` nội bộ của thư viện —
   * đúng lý do lỗi "trợ lý chỉ suy luận rồi im bặt" trước đây không để lại dấu vết nào để lần.
   *
   * HỎI LẠI SERVER thay vì đoán từ `event`: hình dạng sự kiện lỗi của thư viện không có gì bảo
   * đảm mang theo mã HTTP hay thân phản hồi, và đoán sai thì băng báo hiện nhầm lúc trợ lý hỏng
   * vì lý do khác. `GET /han-muc` trả lời dứt khoát, và chỉ tốn một lượt gọi khi ĐÃ có lỗi.
   */
  const onCopilotError = useCallback(async (event) => {
    console.error('[guide] CopilotKit error:', event?.code || '(khong ro ma loi)', event);
    /**
     * Câu nói chung cho MỌI lỗi không phải hạn mức. Cố ý không nêu nguyên nhân: phía client
     * không biết được đó là nhà cung cấp model lỗi, mạng đứt, hay tool hỏng — nói bừa còn tệ
     * hơn nói ít. Cái người dùng cần biết là "lượt này mất, hỏi lại được", cộng một chỉ dẫn
     * để họ báo đúng chỗ nếu lặp lại.
     */
    const generic = {
      title: 'Không nhận được câu trả lời',
      icon: '⚠️',
      message: 'Lượt hỏi này không hoàn thành. Bạn thử hỏi lại; nếu vẫn vậy thì nhờ quản trị viên'
        + ' xem log máy chủ (thường là nhà cung cấp model đang lỗi).',
    };
    try {
      const { data } = await api.get('/copilotkit/quota');
      const outOfQuestions = !!data?.on && data.max_questions > 0 && data.question_count >= data.max_questions;
      const outOfTokens = !!data?.on && data.max_tokens > 0 && data.token_count >= data.max_tokens;
      if (!outOfQuestions && !outOfTokens) { setNotice(generic); return; }
      setNotice({
        title: 'Hết lượt hỏi hôm nay',
        icon: '⏳',
        message: outOfQuestions
          ? `Bạn đã hỏi ${data.question_count}/${data.max_questions} câu được phép trong hôm nay. `
            + 'Hạn mức đặt lại vào nửa đêm.'
          : `Bạn đã dùng ${data.token_count.toLocaleString('vi-VN')}/`
            + `${data.max_tokens.toLocaleString('vi-VN')} token của hôm nay. Hạn mức đặt lại vào nửa đêm.`,
      });
    } catch {
      // Không tra được hạn mức cũng vẫn phải nói một câu: bản trước im ở đây, và người dùng
      // chỉ thấy trợ lý đứng im không lý do.
      setNotice(generic);
    }
  }, []);

  return (
    <CopilotKitProvider
      runtimeUrl={runtimeUrl}
      // `x-guide-full-access`: client tự khai chế độ để server gửi ĐÚNG bộ luật thay vì gửi cả
      // hai (đo được: bỏ được 34% chỉ dẫn ở chế độ đọc — xem helpers/guidePrompt.js).
      // Dùng THẲNG hằng `FULL_ACCESS` — cũng chính là hằng quyết định nhóm tool nào được mount
      // ngay bên dưới, nên prompt và tool không thể lệch nhau.
      headers={{
        Authorization: `Bearer ${token || ''}`,
        'x-guide-full-access': FULL_ACCESS ? '1' : '0',
      }}
      onError={onCopilotError}
    >
      <GuideCopilotTools />
      {FULL_ACCESS ? <GuideFullAccessTools /> : <GuideNavConfirmTool />}
      {/* Bảng hành động — phải nằm TRONG provider để useAgent() thấy được core. */}
      <AgentActivityPanel />
      {/* Nhân vật hệ thống — cũng cần useAgent(), nên cũng phải nằm trong provider. Nó KHÔNG
          thay khung chat: khung chat vẫn mở như cũ, nhân vật diễn ở ngoài. */}
      <GuideMascot />
      <QuotaBanner
        message={notice?.message || ''}
        title={notice?.title}
        icon={notice?.icon}
        onClose={() => setNotice(null)}
      />
      {/* Cầu nối cho ô hỏi nổi: ô hỏi nằm ở bundle chính (luôn hiện), phần gửi cho agent nằm
          đây vì cần useAgent()/useCopilotKit(). */}
      <GuideAskBridge />
      {/* Ghi lại đường đi của những lượt KHÓ để lần sau đi thẳng — xem helpers/guideExperience.js. */}
      <GuideExperienceRecorder />
      {/* Nhật ký ĐẦY ĐỦ mọi lượt (kể cả lượt hỏng) — xem GuideChatLog.jsx. Khác kho kinh nghiệm
          ở trên: bên đó chỉ giữ lượt đáng học. */}
      <GuideChatLog />
      {/* Giữ hội thoại qua lần tải lại trang — runtime không lưu thread, xem GuideChatPersist.jsx. */}
      <GuideChatPersist />
      {/* Sidebar dán mép PHẢI thay cho popup nổi: popup che mất nội dung trang, mà trợ lý toàn
          quyền thì người dùng cần nhìn trang trong lúc nó thao tác. `CopilotSidebar` là component
          có sẵn của thư viện — không tự dựng khung, để giữ nguyên toggle/scroll/thread của nó. */}
      {/* `defaultOpen={false}` — phải truyền TƯỜNG MINH. Bỏ trống prop thì thư viện rơi về
          `viewDefaultOpen` của chính view, vốn là MỞ (đã đo: khung vẫn bật sẵn sau khi xoá prop). Toàn bộ phản hồi hiển thị trên nhân
          vật; khung chat giữ lại làm nơi đọc lịch sử và nội dung dài, mở bằng nút trên ô hỏi
          (xem lib/openGuide.js → moKhungChat). Giữ component vì nó là chỗ duy nhất còn lưu
          thread và cuộn lịch sử — bỏ đi là mất, không phải ẩn. */}
      <CopilotSidebar
        defaultOpen={false}
        position="right"
        width={SIDEBAR_W}
        labels={{
          welcomeMessageText: `Chào ${user?.fullName || user?.full_name || 'bạn'}! Mình là trợ lý hướng dẫn sử dụng hệ thống. Bạn cần tìm tính năng gì?`,
        }}
      />
    </CopilotKitProvider>
  );
}
