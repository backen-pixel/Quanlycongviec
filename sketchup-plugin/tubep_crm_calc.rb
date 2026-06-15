require 'sketchup.rb'
require 'extensions.rb'

# Loader cho extension "TủBếp CRM – Gửi tính giá".
# File loader và thư mục con phải cùng tên (tubep_crm_calc).
module TuBepCRM
  module CalcExporter
    PLUGIN_DIR = File.dirname(__FILE__)

    unless defined?(@loaded) && @loaded
      ext = SketchupExtension.new(
        'TủBếp CRM – Gửi tính giá',
        File.join(PLUGIN_DIR, 'tubep_crm_calc', 'main'),
      )
      ext.description = 'Trích xuất danh sách chi tiết (tên + kích thước W/H/D) từ model SketchUp ' \
                        'và gửi thẳng sang module Tính toán của TủBếp CRM chỉ bằng một nút bấm.'
      ext.version = '1.0.0'
      ext.creator = 'TủBếp CRM'
      ext.copyright = "© #{Time.now.year} TủBếp CRM"
      Sketchup.register_extension(ext, true)
      @loaded = true
    end
  end
end
