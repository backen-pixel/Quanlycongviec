import { Link } from 'react-router-dom';
import { ArrowLeft, Building2 } from 'lucide-react';
import BankAccountsManager from '../components/BankAccountsManager';

export default function AccountingBankAccountsPage() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto px-2">
      <div className="flex items-center gap-3">
        <Link to="/ketoan/dashboard" className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            Tài khoản ngân hàng
          </h1>
        </div>
      </div>

      <BankAccountsManager />
    </div>
  );
}
