process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('node:assert/strict');
const {
  customFieldKeyFromLabel,
  normalizeCustomFieldInput,
  normalizeCustomFieldValue,
  customFieldValueComplete,
  customFieldDisplayValue,
} = require('../src/helpers/businessOsCustomFields');
const {
  normalizeQualificationStageContract,
  buildQualificationRequirements,
} = require('../src/helpers/salesQualificationPilot');

assert.equal(customFieldKeyFromLabel('Loại công trình'), 'custom_loai_cong_trinh');

const selectInput = normalizeCustomFieldInput({
  label: 'Loại công trình',
  field_type: 'select',
  mode: 'required',
  options: 'Căn hộ, Nhà phố\nBiệt thự, Căn hộ',
});
assert.deepEqual(selectInput.options, [
  { value: 'Căn hộ', label: 'Căn hộ' },
  { value: 'Nhà phố', label: 'Nhà phố' },
  { value: 'Biệt thự', label: 'Biệt thự' },
]);

const fields = [
  {
    id: 'field-select',
    key: 'custom_loai_cong_trinh',
    label: 'Loại công trình',
    custom: true,
    field_type: 'select',
    default_mode: 'required',
    options: selectInput.options,
    validation: {},
  },
  {
    id: 'field-bool',
    key: 'custom_da_khao_sat',
    label: 'Đã khảo sát',
    custom: true,
    field_type: 'boolean',
    default_mode: 'optional',
    options: [],
    validation: {},
  },
  {
    id: 'field-number',
    key: 'custom_dien_tich',
    label: 'Diện tích',
    custom: true,
    field_type: 'number',
    default_mode: 'hidden',
    options: [],
    validation: { min: 0, max: 1000 },
  },
];

const contract = normalizeQualificationStageContract({
  required_fields: ['description', 'custom_loai_cong_trinh'],
  optional_fields: ['phone', 'custom_da_khao_sat'],
}, fields);
assert.equal(contract.fields.find((field) => field.key === 'custom_loai_cong_trinh').mode, 'required');
assert.equal(contract.fields.find((field) => field.key === 'custom_da_khao_sat').mode, 'optional');
assert.equal(contract.fields.find((field) => field.key === 'custom_dien_tich').mode, 'hidden');

assert.equal(normalizeCustomFieldValue(fields[0], 'Căn hộ'), 'Căn hộ');
assert.equal(normalizeCustomFieldValue(fields[1], false), false);
assert.equal(normalizeCustomFieldValue(fields[2], '120.5'), 120.5);
assert.equal(customFieldValueComplete(fields[1], false), true);
assert.equal(customFieldDisplayValue(fields[1], false), 'Không');
assert.throws(() => normalizeCustomFieldValue(fields[0], 'Nhà xưởng'), /lựa chọn không hợp lệ/);
assert.throws(() => normalizeCustomFieldValue(fields[2], 1201), /giá trị tối đa/);

const requirements = buildQualificationRequirements({
  customer_id: 'customer-1',
  region_id: 'region-1',
  assigned_to: 'user-1',
  description: 'Khách cần tủ bếp chữ L hiện đại.',
}, contract, {
  custom_loai_cong_trinh: 'Căn hộ',
  custom_da_khao_sat: false,
});
const customRequirements = requirements.filter((item) => item.custom);
assert.equal(customRequirements.length, 2);
assert.equal(customRequirements.every((item) => item.complete), true);
assert.equal(customRequirements.find((item) => item.key === 'custom_da_khao_sat').value, 'Không');

console.log('business-os-custom-fields.test: OK');
