import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import SurveyHandoffs from '../components/facebook/SurveyHandoffs';

export default function SurveyHandoffsPage() {
  const { user } = useAuth();
  const scope = useScopeFilter({ storageKey: 'crm_survey_handoffs', companiesModule: 'crm', showCompany: true, showDepartment: false, showSearch: false, persist: false });
  return <main className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
    <Link to="/crm/events" className="text-blue-700 text-sm">← Sự kiện CRM</Link>
    <h1 className="text-2xl font-semibold">Bàn giao khảo sát</h1>
    <ScopeFilterBar scope={scope} companyLabel="Công ty" companyAllowAll={false} />
    <SurveyHandoffs companyId={scope.companyId} actorId={user?.id || user?.userId} />
  </main>;
}
