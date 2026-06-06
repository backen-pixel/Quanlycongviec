import CompanyCrmRegionsPage from './CompanyCrmRegionsPage';

/** Quản lý khu vực trong module Sản xuất — tái sử dụng CRUD company_regions. */
export default function ProductionRegionsPage() {
  return <CompanyCrmRegionsPage forModule="production" backLink="/sx/dashboard" />;
}
