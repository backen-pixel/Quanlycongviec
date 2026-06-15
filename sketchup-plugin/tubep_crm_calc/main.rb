require 'sketchup.rb'
require 'net/http'
require 'uri'
require 'json'
require 'openssl'

# ──────────────────────────────────────────────────────────────────────────
# TủBếp CRM – Gửi tính giá
#
# Quét model SketchUp, trích xuất từng chi tiết (component/group lá) gồm:
#   - tên (component definition / group name)
#   - kích thước W × H × D (mm)  ← lấy từ bounding box
#   - số lượng (gộp các bản trùng tên + trùng kích thước)
# rồi POST sang  {server}/api/calc/import-items.
#
# Xác thực: đăng nhập bằng email + mật khẩu của tài khoản TủBếp CRM để lấy
# token (lưu cấu hình bằng Sketchup.write_default).
# ──────────────────────────────────────────────────────────────────────────
module TuBepCRM
  module CalcExporter
    SECTION = 'TuBepCRM_Calc'.freeze
    DEFAULT_SERVER = 'https://tubep-backend.onrender.com'.freeze

    module_function

    # ── Cấu hình ────────────────────────────────────────────────────────────
    def cfg_get(key, fallback = '')
      v = Sketchup.read_default(SECTION, key, fallback)
      v.nil? ? fallback : v
    end

    def cfg_set(key, value)
      Sketchup.write_default(SECTION, key, value.to_s)
    end

    def server_url
      url = cfg_get('server_url', DEFAULT_SERVER).to_s.strip
      url = DEFAULT_SERVER if url.empty?
      url.sub(%r{/+$}, '')
    end

    # ── Hộp thoại cấu hình kết nối ───────────────────────────────────────────
    def configure
      prompts  = ['Địa chỉ máy chủ:', 'Email đăng nhập:', 'Mật khẩu:', 'Mã danh mục (tùy chọn):']
      defaults = [server_url, cfg_get('email'), cfg_get('password'), cfg_get('category_id')]
      res = UI.inputbox(prompts, defaults, 'Cấu hình kết nối – TủBếp CRM')
      return false unless res # bấm Cancel

      cfg_set('server_url',  res[0].to_s.strip)
      cfg_set('email',       res[1].to_s.strip)
      cfg_set('password',    res[2].to_s)
      cfg_set('category_id', res[3].to_s.strip)
      UI.messagebox('Đã lưu cấu hình kết nối.')
      true
    end

    # ── Trích xuất chi tiết từ model ─────────────────────────────────────────
    # Duyệt đệ quy, chỉ lấy component/group "lá" (không chứa instance con) — đó
    # thường là các tấm/chi tiết thực. Gộp theo tên + kích thước → qty.
    def extract_items
      model = Sketchup.active_model
      return [] unless model

      groups = {} # key => { name:, w:, h:, d:, qty: }
      collect_entities(model.entities, groups)

      groups.values.sort_by { |it| -it[:qty] }
    end

    def collect_entities(entities, groups)
      entities.each do |e|
        next unless e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)

        children = child_entities(e)
        has_nested = children.any? { |c| c.is_a?(Sketchup::ComponentInstance) || c.is_a?(Sketchup::Group) }

        if has_nested
          collect_entities(children, groups) # đi sâu vào cụm lắp ráp
        else
          record_part(e, groups) # chi tiết lá
        end
      end
    end

    def child_entities(instance)
      if instance.is_a?(Sketchup::Group)
        instance.entities
      else
        instance.definition.entities
      end
    rescue StandardError
      []
    end

    def part_name(instance)
      name = instance.name.to_s.strip
      if name.empty? && instance.is_a?(Sketchup::ComponentInstance)
        name = instance.definition.name.to_s.strip
      end
      name.empty? ? '(không tên)' : name
    end

    def record_part(instance, groups)
      bb = instance.bounds
      w = bb.width.to_mm.round   # X (đỏ)  → Rộng
      d = bb.height.to_mm.round  # Y (xanh)→ Sâu
      h = bb.depth.to_mm.round   # Z (lam) → Cao
      return if w <= 0 && h <= 0 && d <= 0

      name = part_name(instance)
      key = "#{name}|#{w}|#{h}|#{d}"
      if groups[key]
        groups[key][:qty] += 1
      else
        groups[key] = { name: name, w: w, h: h, d: d, qty: 1 }
      end
    rescue StandardError
      nil
    end

    # ── HTTP ─────────────────────────────────────────────────────────────────
    def http_post_json(path, body, token = nil)
      uri = URI.parse("#{server_url}#{path}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      http.verify_mode = OpenSSL::SSL::VERIFY_PEER
      http.open_timeout = 20
      http.read_timeout = 60

      req = Net::HTTP::Post.new(uri.request_uri)
      req['Content-Type'] = 'application/json'
      req['Authorization'] = "Bearer #{token}" if token
      req.body = body.to_json

      res = http.request(req)
      parsed = begin
        JSON.parse(res.body)
      rescue StandardError
        {}
      end
      [res.code.to_i, parsed]
    end

    def login
      email = cfg_get('email')
      password = cfg_get('password')
      raise 'Chưa cấu hình email/mật khẩu. Vào "Cấu hình kết nối…" trước.' if email.empty? || password.empty?

      code, body = http_post_json('/api/auth/login', { email: email, password: password })
      raise(body['error'] || "Đăng nhập thất bại (HTTP #{code})") unless code == 200 && body['token']

      body['token']
    end

    # ── Hành động chính: gửi model ────────────────────────────────────────────
    def send_model
      configure if cfg_get('email').empty? || cfg_get('password').empty?
      return if cfg_get('email').empty? || cfg_get('password').empty?

      items = extract_items
      if items.empty?
        UI.messagebox('Không tìm thấy chi tiết nào. Hãy nhóm các bộ phận thành Component/Group và đặt tên.')
        return
      end

      preview = items.first(8).map { |it| "• #{it[:name]}: #{it[:w]}×#{it[:h]}×#{it[:d]}mm × #{it[:qty]}" }.join("\n")
      more = items.size > 8 ? "\n… và #{items.size - 8} chi tiết khác" : ''
      total_qty = items.sum { |it| it[:qty] }
      msg = "Tìm thấy #{items.size} loại chi tiết (tổng #{total_qty} cái):\n\n#{preview}#{more}\n\nGửi sang TủBếp CRM?"
      return unless UI.messagebox(msg, MB_OKCANCEL) == IDOK

      begin
        token = login
        model_name = Sketchup.active_model.title.to_s
        model_name = 'SketchUp model' if model_name.empty?
        payload = {
          items: items,
          source_name: model_name,
          source_format: 'sketchup',
        }
        cat = cfg_get('category_id')
        payload[:category_id] = cat unless cat.empty?

        code, body = http_post_json('/api/calc/import-items', payload, token)
        if code == 201 && body['import']
          total = body['import']['total_result'] || 0
          UI.messagebox("Gửi thành công!\n#{items.size} loại chi tiết · Tổng giá trị: #{total}\n\n" \
                        'Mở module Tính toán → Tính từ file 3D / Cutlist để xem kết quả.')
        else
          UI.messagebox("Gửi thất bại (HTTP #{code}):\n#{body['error'] || body.inspect}")
        end
      rescue StandardError => e
        UI.messagebox("Lỗi: #{e.message}")
      end
    end

    # ── Menu / Toolbar ────────────────────────────────────────────────────────
    unless defined?(@menu_loaded) && @menu_loaded
      menu = UI.menu('Plugins').add_submenu('TủBếp CRM')
      menu.add_item('Gửi model sang tính giá') { send_model }
      menu.add_item('Cấu hình kết nối…')       { configure }

      toolbar = UI::Toolbar.new('TủBếp CRM')
      cmd = UI::Command.new('Gửi tính giá') { send_model }
      cmd.tooltip = 'Gửi model sang TủBếp CRM để tính giá'
      cmd.status_bar_text = 'Trích xuất chi tiết và gửi sang module Tính toán'
      toolbar.add_item(cmd)
      toolbar.restore

      @menu_loaded = true
    end
  end
end
