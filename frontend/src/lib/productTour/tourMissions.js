import { getTour } from './tours';
import { isTourDone } from './storage';

/** @typedef {{ id: string; tourId: string; title: string; desc: string; group: string; order: number }} TourMission */

/** @type {TourMission[]} */
export const TOUR_MISSIONS = [
  {
    id: 'm-crm-familiar',
    tourId: 'crm-familiar',
    title: 'Làm quen Dashboard CRM',
    desc: 'App Switcher → tab, tìm/bộ lọc/chế độ xem/Tùy chỉnh → KPI, thẻ, gộp hàng loạt, chuyển cột',
    group: 'Bắt đầu',
    order: 1,
  },
  {
    id: 'm-crm-create-lead-deal',
    tourId: 'crm-create-lead-deal',
    title: 'Tạo Lead và Deal',
    desc: 'Chi tiết từng ô form Lead (tên, công ty, KH, SĐT, nguồn) rồi form Deal',
    group: 'Tạo mới',
    order: 2,
  },
  {
    id: 'm-crm-lead-deal-detail',
    tourId: 'crm-lead-deal-detail',
    title: 'Chi tiết Lead / Deal',
    desc: 'Hồ sơ → Tạo sự kiện (form) → Bình luận → Công việc → các tab',
    group: 'Chi tiết',
    order: 3,
  },
  {
    id: 'm-crm-events-page',
    tourId: 'crm-events-page',
    title: 'Trang Sự kiện',
    desc: 'Menu Sự kiện → Lịch / Feed / lọc → tạo sự kiện trên trang',
    group: 'Sự kiện',
    order: 4,
  },
  {
    id: 'm-crm-assignments-page',
    tourId: 'crm-assignments-page',
    title: 'Trang Giao việc',
    desc: 'Menu Giao việc → tab · tìm/lọc · chế độ xem · KPI · Kanban · form giao việc · Không gian chung',
    group: 'Giao việc',
    order: 5,
  },
];

export function listTourMissions() {
  return [...TOUR_MISSIONS].sort((a, b) => a.order - b.order);
}

export function getMissionProgress() {
  const missions = listTourMissions();
  const done = missions.filter((m) => isTourDone(m.tourId)).length;
  return { done, total: missions.length, missions };
}

export function missionStepCount(tourId) {
  return getTour(tourId)?.steps?.length || 0;
}
