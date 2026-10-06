<?php
/**
 * Plugin Name: VPT V1 — Form to CRM
 * Description: Private pilot bridge for CF7 form 11116 to VPT CRM, with durable intake, duplicate suppression and explicit review of uncertain writes.
 * Version: 0.2.4
 * Requires PHP: 7.4
 * Author: Vạn Phú Thành
 */
if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/core.php';

final class VPT_V1_CRM_Bridge {
    const FORM = 11116;
    const PREFIX = 'vpt_v1_crm_job_';
    const SETTINGS = 'vpt_v1_crm_settings';
    const KEY = 'vpt_v1_crm_access_token';
    const PREFLIGHT = 'vpt_v1_crm_preflight';
    const HOOK = 'vpt_v1_crm_dispatch';
    private static $receipt = null;

    public static function boot() {
        add_filter('wpcf7_form_hidden_fields', array(__CLASS__,'test_nonce'));
        add_filter('wpcf7_feedback_response', array(__CLASS__,'feedback'));
        add_action('wp_head', array(__CLASS__,'tracking_script'), 2);
        add_action('woocommerce_single_product_summary', array(__CLASS__,'product_form'), 35);
        add_action('wpcf7_before_send_mail', array(__CLASS__,'capture'), 20, 3);
        add_action(self::HOOK, array(__CLASS__,'dispatch'), 10, 1);
        add_action('admin_menu', array(__CLASS__,'menu'));
        add_action('admin_post_vpt_v1_crm_action', array(__CLASS__,'admin_action'));
    }
    public static function mode() { $s=get_option(self::SETTINGS,array()); return $s['mode'] ?? 'off'; }
    public static function key() { return defined('VPT_V1_CRM_ACCESS_TOKEN') ? (string) VPT_V1_CRM_ACCESS_TOKEN : (string) get_option(self::KEY,''); }
    public static function job_key($id) { return self::PREFIX . $id; }

    public static function test_nonce($fields) {
        // CF7 uses the REST API. WP requires a REST nonce to retain cookie
        // authentication. Issue it only on the private test page for admins;
        // core REST authentication validates it before capture runs.
        if (self::mode()==='test' && is_page(11117) && current_user_can('manage_options')) {
            $fields['_wpnonce']=wp_create_nonce('wp_rest');
        }
        return $fields;
    }

    public static function tracking_script() {
        if (is_admin() || self::mode()==='off') { return; }
        echo '<script data-nowprocket="1" data-cfasync="false" src="'.esc_url(plugins_url('attribution.js',__FILE__)).'?ver=0.2.4" defer></script>';
    }
    public static function product_form() {
        if (!in_array((int)get_the_ID(),array(6368,5864,6203),true)) { return; }
        if (self::mode()!=='live') { return; }
        echo '<section id="tu-van-tu-bep-vpt-v1" style="margin-top:24px;padding:18px;border:1px solid #ddd;border-radius:8px"><h2 style="font-size:1.35em">Nhận tư vấn và báo giá tủ bếp</h2>';
        echo do_shortcode('[contact-form-7 id="11116" title="VPT V1 — Tư vấn tủ bếp inox và nhôm"]');
        echo '</section>';
    }
    public static function feedback($response) {
        if (self::$receipt!==null) { $response['vpt_v1']=self::$receipt; }
        return $response;
    }

    public static function capture($form, &$abort, $submission) {
        self::$receipt=null;
        if ((int) $form->id() !== self::FORM || self::mode() === 'off') { return; }
        if (!$submission || $abort) { return; }
        try {
            $built=VPT_V1_CRM_Core::build($submission->get_posted_data(), self::mode(), current_user_can('manage_options'), $submission->get_meta('url'), time());
        } catch (RuntimeException $e) {
            update_option('vpt_v1_crm_last_notice',array('at'=>time(),'reason'=>$e->getMessage()),false);
            return; // Keep CF7's existing email path unchanged.
        }
        $id=VPT_V1_CRM_Core::fingerprint($built['business'],wp_salt('auth'));
        $job=array('state'=>'queued','request_id'=>wp_generate_uuid4(),'created_at'=>time(),'updated_at'=>time(),'mode'=>self::mode(),'attempts'=>0,'payload'=>$built['payload'],'reason'=>'awaiting_worker');
        // Unique option_name: concurrent identical submissions cannot both enqueue.
        if (!add_option(self::job_key($id),$job,'',false)) {
            $existing=get_option(self::job_key($id),false);
            // A confirmed request may recur after 24h. Pending/uncertain writes never expire into an automatic retry.
            if (!is_array($existing) || $existing['state']!=='sent' || $existing['created_at']>=time()-86400 || !self::cas($id,$existing,$job)) {
                self::$receipt=array('status'=>'duplicate','mode'=>self::mode()); return;
            }
        }
        self::$receipt=array('status'=>'queued','mode'=>self::mode(),'request_id'=>$job['request_id']);
        $result=wp_schedule_single_event(time()+1,self::HOOK,array($id),true);
        if (is_wp_error($result) || $result === false) {
            $job['reason']='cron_not_scheduled_use_admin_queue';
            update_option(self::job_key($id),$job,false);
        }
    }

    private static function cas($id,$old,$new) {
        global $wpdb;
        $changed=$wpdb->query($wpdb->prepare("UPDATE {$wpdb->options} SET option_value=%s WHERE option_name=%s AND option_value=%s",maybe_serialize($new),self::job_key($id),maybe_serialize($old)));
        wp_cache_delete(self::job_key($id),'options');
        return $changed === 1;
    }

    public static function preflight($force=false) {
        $key=self::key();
        if (!preg_match('/^tbp_[A-Za-z0-9_-]{16,512}$/',$key)) { return 'missing_or_invalid_key'; }
        $fingerprint=hash('sha256',$key);
        $old=get_option(self::PREFLIGHT,array());
        if (!$force && ($old['key_hash'] ?? '') === $fingerprint && ($old['verified_at'] ?? 0)>time()-3600) { return true; }
        $required=array('ping'=>null,'regions'=>VPT_V1_CRM_Core::REGION,'users'=>VPT_V1_CRM_Core::OWNER,'pipelines'=>VPT_V1_CRM_Core::PIPELINE,'lead-types'=>VPT_V1_CRM_Core::LEAD_TYPE);
        foreach ($required as $route=>$required_id) {
            $r=wp_remote_get(VPT_V1_CRM_Core::BASE . '/' . $route,array('headers'=>array('X-Api-Key'=>$key,'Accept'=>'application/json'),'timeout'=>15,'redirection'=>0,'sslverify'=>true,'limit_response_size'=>1048576));
            if (is_wp_error($r)) { return 'preflight_transport_' . $route; }
            $status=(int) wp_remote_retrieve_response_code($r);
            if ($status<200 || $status>=300) { return 'preflight_http_' . $status . '_' . $route; }
            $data=json_decode(wp_remote_retrieve_body($r),true);
            if (!is_array($data)) { return 'preflight_invalid_json_' . $route; }
            if ($route==='ping') {
                foreach (VPT_V1_CRM_Core::company_ids($data) as $company) {
                    if ($company !== VPT_V1_CRM_Core::COMPANY) { return 'wrong_company'; }
                }
            }
            if ($required_id && !VPT_V1_CRM_Core::contains_id($data,$required_id)) { return 'preflight_mapping_missing_' . $route; }
        }
        update_option(self::PREFLIGHT,array('key_hash'=>$fingerprint,'verified_at'=>time()),false);
        return true;
    }

    public static function dispatch($id) {
        if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/',$id) || self::mode()==='off') { return; }
        $old=get_option(self::job_key($id),false);
        if (!is_array($old) || $old['state']!=='queued' || $old['mode']!==self::mode()) { return; }
        $job=$old; $job['state']='sending'; $job['updated_at']=time();
        if (!self::cas($id,$old,$job)) { return; }
        $dispatch_key=self::key();
        $check=self::preflight();
        if ($check!==true) {
            $job['state']='blocked'; $job['reason']=$check;
            update_option(self::job_key($id),$job,false); return;
        }
        $verified=get_option(self::PREFLIGHT,array());
        if (self::mode()!==$job['mode'] || self::key()!==$dispatch_key || ($verified['key_hash'] ?? '')!==hash('sha256',$dispatch_key)) {
            $job['state']='blocked'; $job['reason']='configuration_changed_before_send';
            update_option(self::job_key($id),$job,false); return;
        }
        $job['attempts']++; $job['updated_at']=time();
        $marker="\nMã đối soát website: " . $job['request_id'];
        if (strpos($job['payload']['notes'],$marker)===false) { $job['payload']['notes'].=$marker; }
        update_option(self::job_key($id),$job,false);
        $response=wp_remote_post(VPT_V1_CRM_Core::BASE . '/leads',array(
            'headers'=>array('X-Api-Key'=>$dispatch_key,'Content-Type'=>'application/json','Accept'=>'application/json'),
            'body'=>wp_json_encode($job['payload']), 'timeout'=>25,'redirection'=>0,'sslverify'=>true,'limit_response_size'=>1048576
        ));
        $result=VPT_V1_CRM_Core::classify_response(is_wp_error($response)?0:(int)wp_remote_retrieve_response_code($response),is_wp_error($response)?'':wp_remote_retrieve_body($response),is_wp_error($response));
        $job=array_merge($job,$result); $job['updated_at']=time();
        if ($job['state']==='sent') { unset($job['payload']); } // No retained contact payload after confirmed delivery.
        update_option(self::job_key($id),$job,false);
    }

    public static function menu() { add_options_page('VPT V1 — CRM','VPT V1 — CRM','manage_options','vpt-v1-crm',array(__CLASS__,'page')); }
    private static function rows() {
        global $wpdb;
        return $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s ORDER BY option_id DESC LIMIT 100",$wpdb->esc_like(self::PREFIX).'%'),ARRAY_A);
    }
    public static function admin_action() {
        if (!current_user_can('manage_options')) { wp_die('Forbidden',403); }
        check_admin_referer('vpt_v1_crm_action');
        $action=sanitize_key($_POST['operation'] ?? '');
        $notice='done';
        if ($action==='save') {
            $mode=sanitize_key($_POST['mode'] ?? 'off');
            if (!in_array($mode,array('off','test','live'),true)) { $mode='off'; }
            $key=trim((string)wp_unslash($_POST['access_token'] ?? ''));
            if ($key!=='') {
                if (!preg_match('/^tbp_[A-Za-z0-9_-]{16,512}$/',$key)) { wp_die('Khóa không hợp lệ. Không dùng chuỗi đã che.'); }
                if (defined('VPT_V1_CRM_ACCESS_TOKEN')) { wp_die('Khóa đang được quản lý trong wp-config.php.'); }
                update_option(self::KEY,$key,false); delete_option(self::PREFLIGHT);
            }
            if ($mode==='live' && empty($_POST['live_verified'])) { wp_die('Cần xác nhận đã đối soát TEST trong CRM.'); }
            if ($mode!=='off') {
                $check=self::preflight(true);
                if ($check!==true) { $mode='off'; $notice=$check; }
            }
            update_option(self::SETTINGS,array('mode'=>$mode),false);
        } elseif ($action==='check') {
            $result=self::preflight(true); $notice=$result===true?'preflight_verified':$result;
        } elseif ($action==='process') {
            foreach (self::rows() as $row) {
                $job=maybe_unserialize($row['option_value']);
                if (is_array($job) && $job['state']==='queued' && $job['mode']===self::mode()) {
                    self::dispatch(substr($row['option_name'],strlen(self::PREFIX))); break;
                }
            }
        } elseif ($action==='retry') {
            $id=sanitize_text_field($_POST['job_id'] ?? '');
            if (!preg_match('/^[a-f0-9]{64}$/',$id) || empty($_POST['confirmed_absent'])) { wp_die('Cần đối soát CRM và xác nhận chưa tạo lead.'); }
            $old=get_option(self::job_key($id),false);
            if (is_array($old) && in_array($old['state'],array('review','blocked'),true) && isset($old['payload'])) {
                $new=$old; $new['state']='queued'; $new['reason']='admin_confirmed_absent'; $new['updated_at']=time();
                if (self::cas($id,$old,$new)) { self::dispatch($id); }
            }
        }
        update_option('vpt_v1_crm_last_notice',array('at'=>time(),'reason'=>$notice),false);
        wp_safe_redirect(admin_url('options-general.php?page=vpt-v1-crm')); exit;
    }
    private static function form_start($operation) {
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
        wp_nonce_field('vpt_v1_crm_action');
        echo '<input type="hidden" name="action" value="vpt_v1_crm_action"><input type="hidden" name="operation" value="'.esc_attr($operation).'">';
    }
    public static function page() {
        if (!current_user_can('manage_options')) { return; }
        echo '<div class="wrap"><h1>VPT V1 — Kết nối form với CRM</h1><p>Form 11116 → VPT / TP.HCM / Bếp → Admin Vạn Phú Thành. Email hiện hữu vẫn gửi độc lập.</p>';
        echo '<p>Trạng thái: <strong>'.esc_html(self::mode()).'</strong>. Khóa: '.(self::key()!==''?'Đã cấu hình (không hiển thị)':'Chưa có').'.</p>';
        $notice=get_option('vpt_v1_crm_last_notice',array());
        if ($notice) { echo '<p>Kết quả gần nhất: <code>'.esc_html($notice['reason'] ?? '').'</code></p>'; }
        self::form_start('save');
        echo '<p><label>Khóa API <input type="password" name="access_token" value="" autocomplete="new-password" size="55" placeholder="Để trống để giữ nguyên khóa"></label></p>';
        echo '<p><label>Chế độ <select name="mode">';
        foreach (array('off'=>'Tắt','test'=>'TEST — chỉ quản trị viên, số 0000000001','live'=>'Nhận yêu cầu thật') as $mode=>$label) {
            echo '<option value="'.esc_attr($mode).'" '.selected(self::mode(),$mode,false).'>'.esc_html($label).'</option>';
        }
        echo '</select></label></p><p><label><input type="checkbox" name="live_verified" value="1"> Đã kiểm tra TEST: đúng công ty, Admin, khách và không tạo trùng.</label></p>';
        submit_button('Lưu cấu hình'); echo '</form>';
        self::form_start('check'); submit_button('Kiểm tra kết nối và danh mục','secondary'); echo '</form>';
        self::form_start('process'); submit_button('Xử lý một yêu cầu đang chờ','secondary'); echo '</form>';
        echo '<h2>Tối đa 100 nhóm yêu cầu gần nhất</h2><p>Yêu cầu giống hệt nhau được chặn gửi trùng trong 24 giờ. Yêu cầu đang chờ hoặc chưa rõ kết quả tiếp tục được giữ để đối soát, không tự hết hạn rồi gửi lại. Trạng thái sending kéo dài cần quản trị kỹ thuật kiểm tra. Email vẫn gửi theo CF7.</p><table class="widefat"><thead><tr><th>Mã đối soát</th><th>Trạng thái</th><th>Lần gửi</th><th>Kết quả</th><th>Đối soát</th></tr></thead><tbody>';
        foreach (self::rows() as $row) {
            $job=maybe_unserialize($row['option_value']); if (!is_array($job)) { continue; }
            $id=substr($row['option_name'],strlen(self::PREFIX));
            echo '<tr><td><code>'.esc_html($job['request_id']).'</code></td><td>'.esc_html($job['state']).'</td><td>'.esc_html((string)$job['attempts']).'</td><td>'.esc_html($job['reason']).'<br>'.esc_html($job['lead_id'] ?? '').'</td><td>';
            if (in_array($job['state'],array('review','blocked'),true)) {
                self::form_start('retry');
                echo '<input type="hidden" name="job_id" value="'.esc_attr($id).'"><label><input type="checkbox" name="confirmed_absent" value="1" required> Đã kiểm tra CRM, chưa có lead tương ứng</label>';
                submit_button('Gửi lại sau đối soát','secondary','submit',false); echo '</form>';
            }
            echo '</td></tr>';
        }
        echo '</tbody></table><p>Chưa có tự động xóa dữ liệu hàng chờ; quản trị cần xử lý các yêu cầu bị giữ. Bản gửi thành công chỉ giữ mã đối soát và ID CRM, không giữ nội dung liên hệ.</p></div>';
    }
}
VPT_V1_CRM_Bridge::boot();
