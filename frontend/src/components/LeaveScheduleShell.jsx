import LeaveSubNav from './LeaveSubNav';

export default function LeaveScheduleShell({ children }) {
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quản lý nghỉ phép</h1>
          <p className="text-sm text-gray-500 mt-1">Theo dõi lịch nghỉ và đơn nghỉ của nhân viên</p>
        </div>
        <LeaveSubNav />
      </div>
      {children}
    </div>
  );
}
