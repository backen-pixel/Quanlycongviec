import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../lib/api';
import {
  Award, ChevronLeft, Loader2, Printer, Share2, ShieldCheck, ShieldAlert,
  Calendar, Hash, BookOpen, Trophy, Sparkles, Copy, CheckCircle2,
} from 'lucide-react';

function formatDate(iso, withTime = false) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (withTime) {
      return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function roleLabel(r) {
  const map = {
    admin: 'Quản trị viên',
    manager: 'Quản lý',
    sales_admin: 'Quản trị Sales',
    sales: 'Nhân viên kinh doanh',
    employee: 'Nhân viên',
    accountant: 'Kế toán',
  };
  return map[r] || r || 'Thành viên';
}

export default function KnowledgeCertificateDetailPage() {
  const { id } = useParams();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/knowledge/certificates/${id}`);
      setCert(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handlePrint = () => window.print();

  const handleCopyVerify = async () => {
    if (!cert) return;
    try {
      await navigator.clipboard.writeText(cert.verify_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>Không tìm thấy chứng nhận</p>
        <Link to="/knowledge/certificates" className="text-amber-600 text-sm mt-2 inline-block">← Quay lại</Link>
      </div>
    );
  }

  const isRevoked = cert.status === 'revoked';
  const fullName = cert.user?.full_name || cert.metadata?.full_name || 'Thành viên';
  const badgeUrl = cert.badge_image_url || cert.category?.badge_image_url || cert.metadata?.badge_image_url;
  const tpl = cert.category?.certificate_template || cert.metadata?.certificate_template || {};
  const signatureName = tpl.signature_name || '';
  const signatureTitle = tpl.signature_title || 'Phụ trách đào tạo';
  const footerNote = tpl.footer_note || '';

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print-page { width: 100vw; height: 100vh; box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          aside, nav, header { display: none !important; }
          .sidebar, .print-hide { display: none !important; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between mb-4 flex-wrap gap-3">
        <Link to="/knowledge/certificates" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-amber-600">
          <ChevronLeft className="h-4 w-4" /> Bộ sưu tập chứng nhận
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyVerify}
            className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:border-amber-300 flex items-center gap-2"
          >
            {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Đã sao chép' : 'Sao mã xác minh'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-semibold hover:from-amber-600 hover:to-orange-600 flex items-center gap-2"
          >
            <Printer className="h-4 w-4" /> In / Lưu PDF
          </button>
        </div>
      </div>

      {isRevoked && (
        <div className="print:hidden mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-900">Chứng nhận này đã bị thu hồi</p>
            <p className="text-sm text-red-700 mt-0.5">
              {cert.revoked_reason || 'Liên hệ quản trị viên để biết thêm chi tiết.'}
            </p>
            <p className="text-xs text-red-600 mt-1">Thu hồi vào: {formatDate(cert.revoked_at, true)}</p>
          </div>
        </div>
      )}

      <div
        className={`print-page relative bg-white rounded-2xl shadow-2xl overflow-hidden border-8 ${
          isRevoked ? 'border-gray-300 grayscale' : 'border-amber-300'
        }`}
        style={{ aspectRatio: '1.414 / 1', minHeight: '500px' }}
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-yellow-50" />
          <div className="absolute -top-20 -right-20 w-96 h-96 bg-amber-300/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] bg-orange-300/15 rounded-full blur-3xl" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="cert-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1.5" fill="#92400e" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cert-pattern)" />
          </svg>
        </div>

        <div className="absolute inset-4 border-2 border-amber-300/60 rounded-xl" />
        <div className="absolute inset-6 border border-amber-400/40 rounded-lg" />

        <div className="absolute top-6 left-6 w-12 h-12 border-t-4 border-l-4 border-amber-500 rounded-tl-xl" />
        <div className="absolute top-6 right-6 w-12 h-12 border-t-4 border-r-4 border-amber-500 rounded-tr-xl" />
        <div className="absolute bottom-6 left-6 w-12 h-12 border-b-4 border-l-4 border-amber-500 rounded-bl-xl" />
        <div className="absolute bottom-6 right-6 w-12 h-12 border-b-4 border-r-4 border-amber-500 rounded-br-xl" />

        <div className="relative h-full flex flex-col items-center justify-between px-8 py-10 md:px-16 md:py-14 text-center">
          <div>
            <div className="inline-flex items-center gap-3">
              {badgeUrl ? (
                <img
                  src={badgeUrl}
                  alt="Huy chương"
                  className={`w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-xl ${isRevoked ? 'grayscale' : ''}`}
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg">
                  <Trophy className="h-7 w-7" />
                </div>
              )}
              <div className="text-left">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-700 font-bold">Hệ thống Học tập Doanh nghiệp</p>
                <p className="text-[10px] text-amber-600/80 mt-0.5">Knowledge Hub</p>
              </div>
            </div>

            <h1 className="mt-6 text-4xl md:text-5xl font-serif font-bold text-gray-900 tracking-wide">
              CHỨNG NHẬN
            </h1>
            <p className="mt-1 text-sm md:text-base text-amber-700 font-semibold uppercase tracking-[0.4em]">
              Hoàn thành khoá học
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center w-full max-w-3xl">
            <p className="text-sm md:text-base text-gray-600 italic mb-2">Chứng nhận này được trao tặng cho</p>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-amber-700 tracking-wide mb-1 break-words">
              {fullName}
            </h2>
            <p className="text-xs md:text-sm text-gray-500">
              {roleLabel(cert.metadata?.role || cert.user?.role)}
              {cert.user?.email ? ` · ${cert.user.email}` : ''}
            </p>

            <div className="my-6 flex items-center justify-center gap-3">
              <div className="h-px bg-amber-300 flex-1 max-w-[80px]" />
              <Sparkles className="h-4 w-4 text-amber-500" />
              <div className="h-px bg-amber-300 flex-1 max-w-[80px]" />
            </div>

            <p className="text-sm md:text-base text-gray-700 leading-relaxed">
              vì đã hoàn thành xuất sắc toàn bộ <strong className="text-gray-900">{cert.total_lessons}</strong> bài học
              {cert.total_exercises > 0 && (
                <> và đạt <strong className="text-gray-900">{cert.passed_exercises}/{cert.total_exercises}</strong> bài tập</>
              )}
              {' '}của khoá học
            </p>
            <h3 className="mt-2 text-2xl md:text-3xl font-bold text-gray-900">
              {cert.category?.icon} {cert.category?.name || 'Khoá học'}
            </h3>
            {cert.avg_exercise_score != null && (
              <p className="mt-2 text-sm text-emerald-700 font-semibold">
                Điểm trung bình bài tập: {cert.avg_exercise_score}/100
              </p>
            )}
          </div>

          <div className="w-full grid grid-cols-4 gap-4 text-center text-xs md:text-sm items-end">
            <div>
              <p className="font-mono font-bold text-gray-800 text-xs md:text-sm">{cert.certificate_number}</p>
              <div className="mt-1 pt-1 border-t border-gray-300">
                <p className="text-[10px] uppercase text-gray-500 tracking-wider">Số chứng nhận</p>
              </div>
            </div>
            <div>
              <p className="font-serif italic text-amber-700 text-xs md:text-sm">{formatDate(cert.issued_at)}</p>
              <div className="mt-1 pt-1 border-t border-gray-300">
                <p className="text-[10px] uppercase text-gray-500 tracking-wider">Ngày cấp</p>
              </div>
            </div>
            <div>
              <p className="font-mono font-bold text-gray-800 text-xs md:text-sm">{cert.verify_code}</p>
              <div className="mt-1 pt-1 border-t border-gray-300">
                <p className="text-[10px] uppercase text-gray-500 tracking-wider">Mã xác minh</p>
              </div>
            </div>
            <div>
              {signatureName ? (
                <p className="font-serif italic text-amber-800 text-sm md:text-base">{signatureName}</p>
              ) : (
                <p className="text-gray-300 text-xs">— ký số —</p>
              )}
              <div className="mt-1 pt-1 border-t border-gray-300">
                <p className="text-[10px] uppercase text-gray-500 tracking-wider">{signatureTitle}</p>
              </div>
            </div>
          </div>

          {footerNote && (
            <p className="text-[10px] md:text-xs text-gray-400 italic text-center mt-2">{footerNote}</p>
          )}
        </div>

        {/* Con dấu xác thực (góc dưới phải) */}
        <div className="absolute bottom-12 right-12 print:bottom-16 print:right-16">
          <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full border-4 ${
            isRevoked ? 'border-gray-400' : 'border-amber-500'
          } flex items-center justify-center bg-white/80 backdrop-blur-sm rotate-[-12deg] shadow-lg`}>
            <div className="text-center">
              {isRevoked ? (
                <ShieldAlert className="h-7 w-7 text-gray-500 mx-auto" />
              ) : (
                <ShieldCheck className="h-7 w-7 text-amber-600 mx-auto" />
              )}
              <p className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider mt-1 ${
                isRevoked ? 'text-gray-500' : 'text-amber-700'
              }`}>
                {isRevoked ? 'Đã thu hồi' : 'Đã xác thực'}
              </p>
            </div>
          </div>
        </div>

        {/* Huy chương lớn (góc dưới trái — chỉ hiện khi có ảnh) */}
        {badgeUrl && (
          <div className="absolute bottom-12 left-12 print:bottom-16 print:left-16">
            <img
              src={badgeUrl}
              alt="Huy chương"
              className={`w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-2xl ${isRevoked ? 'grayscale opacity-60' : ''}`}
            />
          </div>
        )}
      </div>

      <div className="print:hidden mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> Tiến độ học
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{cert.completed_lessons}/{cert.total_lessons}</p>
          <p className="text-xs text-gray-500 mt-0.5">bài học hoàn thành</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold flex items-center gap-1">
            <Award className="h-3.5 w-3.5" /> Bài tập
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {cert.passed_exercises}/{cert.total_exercises || '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {cert.avg_exercise_score != null ? `Điểm TB: ${cert.avg_exercise_score}` : 'Không có bài tập'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Xác minh
          </p>
          <p className="font-mono text-lg font-bold text-gray-900 mt-1">{cert.verify_code}</p>
          <p className="text-xs text-gray-500 mt-0.5">Dùng mã này để xác thực chứng nhận</p>
        </div>
      </div>

      <div className="print:hidden mt-3 text-xs text-gray-400 text-center">
        Mẹo: bấm "In / Lưu PDF" → trong hộp thoại in chọn khổ <strong>A4 ngang (Landscape)</strong> và lề <strong>None</strong> để bằng chứng nhận đẹp nhất.
      </div>
    </div>
  );
}
