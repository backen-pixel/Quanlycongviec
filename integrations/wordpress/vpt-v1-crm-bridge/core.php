<?php
/** Pure mapping and response policy; no network or WordPress state. */
final class VPT_V1_CRM_Core {
    const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
    const OWNER = '49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c';
    const REGION = 'f68e643d-7999-442c-83ee-edb7f5237ab1';
    const PIPELINE = '78e6251c-aea1-46bc-a19f-a401f1de7f34';
    const LEAD_TYPE = '889a29ee-ddb4-478e-9e15-755eaf4b3639';
    const BASE = 'https://tubep-backend.onrender.com/api/external';

    public static function text($value, $limit = 1000) {
        if (is_array($value)) {
            $value = implode(', ', array_filter($value, 'is_scalar'));
        }
        if (!is_scalar($value)) { return ''; }
        $value = trim(strip_tags((string) $value));
        $value = preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', '', $value);
        if (!preg_match('//u', $value)) { return ''; }
        if (function_exists('mb_substr')) { return mb_substr($value, 0, $limit, 'UTF-8'); }
        return implode('', array_slice(preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY), 0, $limit));
    }

    public static function phone($raw, $test) {
        $raw = self::text($raw, 40);
        if ($test && $raw === '0000000001') { return $raw; }
        if (!preg_match('/^\+?[0-9\s().-]+$/', $raw)) { return ''; }
        $digits = preg_replace('/\D/', '', $raw);
        if (strpos($digits, '0084') === 0) { $digits = '0' . substr($digits, 4); }
        elseif (strpos($digits, '84') === 0) { $digits = '0' . substr($digits, 2); }
        return preg_match('/^(0[35789][0-9]{8}|02[0-9]{9})$/', $digits) ? $digits : '';
    }

    public static function build($data, $mode, $is_admin, $submitted_url, $now) {
        if (!in_array($mode, array('test', 'live'), true)) { throw new RuntimeException('bridge_off'); }
        $test = $mode === 'test';
        if ($test && !$is_admin) { throw new RuntimeException('test_requires_admin'); }
        if (self::text($data['vpt_form'] ?? '') !== 'VPT_V1') { throw new RuntimeException('wrong_form_marker'); }
        if (empty($data['your-consent'])) { throw new RuntimeException('missing_consent'); }
        $name = self::text($data['your-name'] ?? '', 160);
        $area = self::text($data['your-area'] ?? '', 300);
        $phone = self::phone($data['your-phone'] ?? '', $test);
        if (!$name || !$area || !$phone) { throw new RuntimeException('invalid_required_fields'); }
        if ($test && ($phone !== '0000000001' || strpos($name, 'TEST VPT V1') !== 0)) {
            throw new RuntimeException('test_requires_synthetic_contact');
        }
        if (!$test && (stripos($name, 'TEST VPT V1') !== false || strpos((string) ($data['gclid'] ?? ''), 'VPT_TEST_') === 0)) {
            throw new RuntimeException('test_data_in_live');
        }
        $material = self::text($data['your-material'] ?? '', 100);
        $timeline = self::text($data['your-timeline'] ?? '', 100);
        $message = self::text($data['your-message'] ?? '', 1500);
        $tracking = array();
        foreach (array('utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device') as $field) {
            $tracking[$field] = self::text($data[$field] ?? '', 256);
        }
        // UTM and click IDs are visitor-supplied attribution signals, not verified sales.
        $paid = strtolower($tracking['utm_source']) === 'google' && in_array(strtolower($tracking['utm_medium']), array('cpc','ppc','paid_search'), true);
        $chatgpt_paid = strtolower($tracking['utm_source']) === 'chatgpt' && strtolower($tracking['utm_medium']) === 'paid';
        $source = $test ? 'TEST VPT V1 — không tính khách' : ($paid ? 'Google Ads VPT V1' : ($chatgpt_paid ? 'ChatGPT Ads VPT V1' : 'Website VPT V1'));
        $url = parse_url((string) $submitted_url);
        $page = '';
        if (is_array($url) && in_array(strtolower($url['host'] ?? ''), array('vanphuthanh.net','www.vanphuthanh.net'), true)) {
            $page = 'https://vanphuthanh.net' . ($url['path'] ?? '/');
        }
        $notes = 'VPT_V1 | ' . gmdate('c', $now) . "\nĐồng ý liên hệ: có\nTrang: " . $page;
        if ($test) { $notes .= "\nTEST: KHÔNG GỌI, không báo giá, không tính doanh thu/chuyển đổi."; }
        foreach ($tracking as $key => $value) { $notes .= "\n" . $key . ': ' . $value; }
        // Additive CRM contract; keep notes and the business-only deduplication unchanged.
        $attribution = array('kenh'=>'website', 'platform'=>'direct');
        if ($page !== '') { $attribution['landing_url'] = $page; }
        $platform = strtolower(trim($tracking['utm_source']));
        if ($platform !== '') { $attribution['platform'] = $platform; }
        elseif ($tracking['gclid'] !== '' || $tracking['gbraid'] !== '' || $tracking['wbraid'] !== '') {
            $attribution['platform'] = 'google';
        }
        foreach (array('utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid') as $field) {
            if ($tracking[$field] !== '') { $attribution[$field] = $tracking[$field]; }
        }
        if ($tracking['campaignid'] !== '') { $attribution['campaign_id'] = $tracking['campaignid']; }
        if ($tracking['adgroupid'] !== '') { $attribution['adset_id'] = $tracking['adgroupid']; }
        $business = array('name'=>$name,'phone'=>$phone,'area'=>$area,'material'=>$material,'timeline'=>$timeline,'message'=>$message,'test'=>$test);
        return array(
            'business'=>$business,
            'payload'=>array(
                'title'=>($test ? '[TEST — KHÔNG LIÊN HỆ] ' : '') . 'Tư vấn tủ bếp — ' . $name,
                'phone'=>$phone, 'full_name'=>$name, 'address'=>$area, 'type'=>'lead',
                'region_id'=>self::REGION, 'pipeline_id'=>self::PIPELINE,
                'lead_type_id'=>self::LEAD_TYPE, 'assigned_to'=>self::OWNER,
                'source_name'=>$source, 'description'=>'Vật liệu: ' . $material . "\nDự kiến: " . $timeline . "\nGhi chú: " . $message,
                'notes'=>$notes, 'is_test'=>$test, 'attribution'=>$attribution
            )
        );
    }

    public static function fingerprint($business, $secret) {
        return hash_hmac('sha256', json_encode($business, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $secret);
    }

    public static function contains_id($data, $id) {
        if (!is_array($data)) { return false; }
        if (isset($data['id']) && $data['id'] === $id) { return true; }
        foreach ($data as $value) { if (is_array($value) && self::contains_id($value, $id)) { return true; } }
        return false;
    }

    public static function company_ids($data) {
        $ids = array();
        if (!is_array($data)) { return $ids; }
        foreach ($data as $key=>$value) {
            if ($key === 'company_id' && is_string($value)) { $ids[] = $value; }
            elseif (is_array($value)) { $ids = array_merge($ids, self::company_ids($value)); }
        }
        return array_values(array_unique($ids));
    }

    public static function classify_response($status, $body, $transport_error = false) {
        if ($transport_error) { return array('state'=>'review','reason'=>'transport_outcome_unknown'); }
        $data = json_decode((string) $body, true);
        $id = is_array($data) ? ($data['lead']['id'] ?? '') : '';
        if ($status >= 200 && $status < 300 && is_string($id) && preg_match('/^[0-9a-f]{8}-[0-9a-f-]{27}$/i', $id)) {
            return array('state'=>'sent','reason'=>'confirmed_lead_id','lead_id'=>$id);
        }
        // No automatic POST retry: the service has no documented idempotency contract.
        return array('state'=>'review','reason'=>($status >= 200 && $status < 300) ? 'success_without_lead_id' : 'http_' . (int) $status);
    }
}
