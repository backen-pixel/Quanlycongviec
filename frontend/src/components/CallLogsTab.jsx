import { useState, useEffect } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Pause, Download, Clock, User, Calendar, RefreshCw } from 'lucide-react';
import api from '../lib/api';

export default function CallLogsTab({ leadId, customerId }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [audioRef, setAudioRef] = useState(null);

  useEffect(() => {
    load();
  }, [leadId, customerId]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (leadId) params.lead_id = leadId;
      if (customerId) params.customer_id = customerId;
      const r = await api.get('/integrations/stringee/calls', { params });
      setCalls(r.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const togglePlay = (call) => {
    if (playingId === call.id) {
      // Pause
      if (audioRef) { audioRef.pause(); }
      setPlayingId(null);
      return;
    }
    // Play new
    if (audioRef) { audioRef.pause(); }
    const audio = new Audio(call.recording_url);
    audio.play();
    audio.onended = () => setPlayingId(null);
    setAudioRef(audio);
    setPlayingId(call.id);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}p ${s}s` : `${s}s`;
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusInfo = (status) => {
    switch (status?.toUpperCase()) {
      case 'ENDED': case 'ANSWERED': return { label: 'Đã nghe', color: 'text-green-600 bg-green-50' };
      case 'MISSED': case 'BUSY': case 'NOANSWER': return { label: 'Nhỡ', color: 'text-red-600 bg-red-50' };
      case 'RINGING': return { label: 'Đang đổ chuông', color: 'text-yellow-600 bg-yellow-50' };
      default: return { label: status || 'N/A', color: 'text-gray-600 bg-gray-50' };
    }
  };

  const DirectionIcon = ({ direction }) => {
    if (direction === 'inbound') return <PhoneIncoming size={16} className="text-blue-500" />;
    return <PhoneOutgoing size={16} className="text-green-500" />;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Phone size={16} />
          Lịch sử cuộc gọi ({calls.length})
        </h3>
        <button onClick={load} className="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Làm mới">
          <RefreshCw size={14} />
        </button>
      </div>

      {calls.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <PhoneMissed size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Chưa có cuộc gọi nào</p>
          <p className="text-xs mt-1">Cuộc gọi qua Stringee sẽ tự động hiển thị ở đây</p>
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map(call => {
            const statusInfo = getStatusInfo(call.status);
            const isPlaying = playingId === call.id;
            return (
              <div key={call.id} className="bg-white border rounded-xl p-3.5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Direction + Phone info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0 border">
                      <DirectionIcon direction={call.direction} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-800">
                          {call.direction === 'inbound' ? call.phone_from : call.phone_to}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-full bg-gray-50">
                          {call.direction === 'inbound' ? '← Gọi đến' : '→ Gọi đi'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                        {call.started_at && (
                          <span className="flex items-center gap-1">
                            <Calendar size={10} /> {formatTime(call.started_at)}
                          </span>
                        )}
                        {call.duration_seconds > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} /> {formatDuration(call.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Recording controls */}
                  {call.recording_url && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => togglePlay(call)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          isPlaying
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        }`}
                        title={isPlaying ? 'Tạm dừng' : 'Phát ghi âm'}
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                      </button>
                      <a
                        href={call.recording_url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center transition-colors"
                        title="Tải xuống"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  )}
                </div>

                {/* Audio waveform placeholder when playing */}
                {isPlaying && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-blue-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                      </div>
                      <span className="text-[10px] text-gray-400">{formatDuration(call.duration_seconds)}</span>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {call.notes && (
                  <p className="mt-2 text-xs text-gray-500 italic border-t pt-2">{call.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
