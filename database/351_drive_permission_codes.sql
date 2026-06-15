-- 351_drive_permission_codes.sql
-- Module Drive: seed permission codes vào bảng `permissions` để admin gán cho roles.
-- Idempotent. Schema bảng permissions có thể khác nhau giữa môi trường
-- (một số DB chỉ có resource/action/description/is_active, không có name) → dò động.

BEGIN;

DO $$
DECLARE
  has_name        boolean;
  has_description boolean;
  has_is_active   boolean;
  rec RECORD;
  cols text;
  vals text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='name')
    INTO has_name;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='description')
    INTO has_description;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='is_active')
    INTO has_is_active;

  FOR rec IN
    SELECT * FROM (VALUES
      ('drive','view',          'Xem Drive',                'Truy cập module Drive và xem file/folder được phép'),
      ('drive','upload',        'Tải lên Drive',            'Upload file lên Drive (vùng cá nhân & vùng được cấp quyền editor)'),
      ('drive','create_folder', 'Tạo thư mục Drive',        'Tạo thư mục trong vùng được cấp quyền editor'),
      ('drive','share',         'Chia sẻ Drive',            'Chia sẻ file/folder cho user/phòng ban khác'),
      ('drive','delete',        'Xoá Drive',                'Đưa file/folder vào thùng rác'),
      ('drive','delete_forever','Xoá vĩnh viễn Drive',      'Xoá vĩnh viễn file/folder khỏi Drive (chỉ admin)'),
      ('drive','manage_shared', 'Quản lý Drive chung',      'Tạo Drive chung mới và quản lý thành viên Drive chung'),
      ('drive','link_entity',   'Gắn file Drive vào CRM',   'Gắn/bỏ gắn file Drive vào lead/task/project')
    ) AS t(resource, action, p_name, p_desc)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM permissions WHERE resource = rec.resource AND action = rec.action
    ) THEN
      -- Build INSERT động theo cột thực tế.
      cols := 'resource, action';
      vals := quote_literal(rec.resource) || ', ' || quote_literal(rec.action);
      IF has_name THEN
        cols := cols || ', name';
        vals := vals || ', ' || quote_literal(rec.p_name);
      END IF;
      IF has_description THEN
        cols := cols || ', description';
        vals := vals || ', ' || quote_literal(rec.p_desc);
      END IF;
      IF has_is_active THEN
        cols := cols || ', is_active';
        vals := vals || ', true';
      END IF;
      EXECUTE 'INSERT INTO permissions (' || cols || ') VALUES (' || vals || ')';
    ELSE
      -- UPDATE chỉ những cột thực sự có.
      IF has_description AND has_name THEN
        EXECUTE 'UPDATE permissions SET name = $1, description = $2'
                || CASE WHEN has_is_active THEN ', is_active = true' ELSE '' END
                || ' WHERE resource = $3 AND action = $4'
          USING rec.p_name, rec.p_desc, rec.resource, rec.action;
      ELSIF has_description THEN
        EXECUTE 'UPDATE permissions SET description = $1'
                || CASE WHEN has_is_active THEN ', is_active = true' ELSE '' END
                || ' WHERE resource = $2 AND action = $3'
          USING rec.p_desc, rec.resource, rec.action;
      ELSIF has_name THEN
        EXECUTE 'UPDATE permissions SET name = $1'
                || CASE WHEN has_is_active THEN ', is_active = true' ELSE '' END
                || ' WHERE resource = $2 AND action = $3'
          USING rec.p_name, rec.resource, rec.action;
      ELSIF has_is_active THEN
        EXECUTE 'UPDATE permissions SET is_active = true WHERE resource = $1 AND action = $2'
          USING rec.resource, rec.action;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
