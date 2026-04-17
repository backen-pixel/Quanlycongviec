/** Response từ POST /crm/quotations/parse-excel */
export type ParsedExcelItem = {
  is_group?: boolean;
  is_freebie?: boolean;
  name: string;
  description?: string;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  vat_rate?: number;
  height?: number | null;
  width?: number | null;
  length?: number | null;
  notes?: string;
  group_name?: string | null;
  group_discount_percent?: number;
  group_summary_discount_percent?: number;
};

export type ParsedExcelResponse = {
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  kts_info?: string;
  title?: string;
  items: ParsedExcelItem[];
  notes?: string;
  summary?: {
    subtotal?: number;
    discount_amount?: number;
    total?: number;
    summary_rows?: unknown[];
  };
  columns_detected?: Record<string, number>;
  header_row?: number;
  total_rows?: number;
};

/** Payload dòng hàng gửi POST/PUT /crm/quotations */
export type QuotationItemPayload = {
  name: string;
  description?: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  spec_factor?: number;
  discount_percent?: number;
  vat_rate?: number;
  height?: string | number | null;
  width?: string | number | null;
  length?: string | number | null;
  dimensions?: string | null;
  group_name?: string | null;
  notes?: string | null;
  product_id?: string | null;
};

export type QuotationRow = {
  id: string;
  code?: string;
  title?: string | null;
  customer_name?: string | null;
  total?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export type OrderRow = {
  id: string;
  code?: string;
  title?: string | null;
  customer_name?: string | null;
  total?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export type InvoiceRow = {
  id: string;
  code?: string;
  title?: string | null;
  customer_name?: string | null;
  total?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  status?: string | null;
  created_at?: string | null;
};
