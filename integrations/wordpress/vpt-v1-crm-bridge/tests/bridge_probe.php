<?php
// Execute the real entrypoint against synthetic WordPress/WooCommerce adapters.
// No WordPress bootstrap, HTTP, database, customers, credentials or site writes.
define('ABSPATH', __DIR__ . '/synthetic-wordpress/');
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$hooks = array();
$shortcodes = array();
function add_filter($name, $callback, $priority = 10, $accepted = 1) {
    $GLOBALS['hooks'][] = array('kind'=>'filter', 'name'=>$name, 'method'=>$callback[1], 'priority'=>$priority, 'accepted'=>$accepted);
}
function add_action($name, $callback, $priority = 10, $accepted = 1) {
    $GLOBALS['hooks'][] = array('kind'=>'action', 'name'=>$name, 'method'=>$callback[1], 'priority'=>$priority, 'accepted'=>$accepted);
}
function get_option($name, $default = false) {
    return $name === 'vpt_v1_crm_settings' ? array('mode'=>$GLOBALS['input']['mode'] ?? 'off') : $default;
}
function is_product_category() { return ($GLOBALS['input']['page_kind'] ?? '') === 'category'; }
function is_product() { return ($GLOBALS['input']['page_kind'] ?? '') === 'product'; }
function get_queried_object() {
    return isset($GLOBALS['input']['term_id']) ? (object)array('term_id'=>$GLOBALS['input']['term_id']) : null;
}
function get_the_ID() { return $GLOBALS['input']['product_id'] ?? 0; }
function get_the_terms($id, $taxonomy) {
    $ids = $GLOBALS['input']['terms'] ?? false;
    return is_array($ids) ? array_map(function ($term) { return (object)array('term_id'=>$term); }, $ids) : false;
}
function get_ancestors($id, $taxonomy, $type) { return $GLOBALS['input']['ancestors'][(string)$id] ?? array(); }
function do_shortcode($value) { $GLOBALS['shortcodes'][]=$value; return '<synthetic-form />'; }
require $argv[1];
ob_start(); VPT_V1_CRM_Bridge::product_form(); $product_form=ob_get_clean();
ob_start(); VPT_V1_CRM_Bridge::kitchen_cta(); $cta=ob_get_clean();
echo json_encode(array('hooks'=>$hooks, 'roots'=>VPT_V1_CRM_Bridge::KITCHEN_ROOTS,
    'eligible'=>VPT_V1_CRM_Bridge::kitchen_upsell_page(), 'product_form'=>$product_form,
    'cta'=>$cta, 'shortcodes'=>$shortcodes), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
