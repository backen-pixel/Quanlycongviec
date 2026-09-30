<?php
// Isolated pure-core probe. No WordPress bootstrap, application env, DB or HTTP.
require $argv[1];
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
try {
    switch ($input['operation']) {
    case 'build':
        $built = VPT_V1_CRM_Core::build($input['data'], $input['mode'], $input['is_admin'], $input['url'], $input['now']);
        $result = array('build'=>$built, 'fingerprint'=>VPT_V1_CRM_Core::fingerprint($built['business'], 'isolated-synthetic-test-key'));
        break;
    case 'response':
        $result = VPT_V1_CRM_Core::classify_response($input['status'], $input['body'], $input['transport_error']);
        break;
    case 'scope':
        $result = array(
            'company'=>VPT_V1_CRM_Core::COMPANY,
            'owner'=>VPT_V1_CRM_Core::OWNER,
            'region'=>VPT_V1_CRM_Core::REGION,
            'pipeline'=>VPT_V1_CRM_Core::PIPELINE,
            'lead_type'=>VPT_V1_CRM_Core::LEAD_TYPE,
            'base'=>VPT_V1_CRM_Core::BASE,
            'contains'=>VPT_V1_CRM_Core::contains_id($input['data'], $input['id']),
            'company_ids'=>VPT_V1_CRM_Core::company_ids($input['data'])
        );
        break;
    default:
        throw new RuntimeException('unknown_probe_operation');
    }
    echo json_encode(array('ok'=>true, 'result'=>$result), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    echo json_encode(array('ok'=>false, 'error'=>$error->getMessage()), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

