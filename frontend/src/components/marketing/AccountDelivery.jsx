const money=value=>value.toLocaleString('vi-VN')+' đ';
export default function AccountDelivery({report}){
 if(!report)return null;
 return <section aria-label="Quảng cáo cần đối soát điểm nhận khách" className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Quảng cáo và điểm nhận khách</h3>
  <p className="text-sm text-slate-600">Đối soát tiền, lượt hiển thị và lượt nhấp theo từng quảng cáo trong kỳ. Còn cần xác nhận các điểm nhận đã dùng trong thời gian này để kết luận đủ nguồn khách.</p>
  {report.accounts.map(a=><article key={a.accountId} className="space-y-2 rounded-lg bg-slate-50 p-3"><h4 className="font-medium">Tài khoản {a.accountId}</h4>
   {a.status==='UNAVAILABLE'?<p className="text-sm text-amber-800">{a.reason==='DELIVERY_NOT_COLLECTED'?'Chưa thu thập danh sách quảng cáo cùng lần đối soát chi tiêu.':'Chưa đủ dữ liệu cùng kỳ hoặc dữ liệu đã cũ; cần đồng bộ lại.'}</p>:<>
    <p className="text-sm">{a.adCount} quảng cáo · {money(a.spendVnd)} · {a.zeroSpendWithSignals} quảng cáo có hiển thị/nhấp nhưng chi bằng 0.</p>
    <p className="text-xs text-slate-500">Thu thập đến {new Date(a.collectedTo).toLocaleString('vi-VN')}. Điểm nhận trong quá khứ chưa được xác nhận.</p>
    {!!a.sourceOnlyAdIds.length&&<p role="status" className="text-sm text-amber-800">Có nguồn khách gắn với quảng cáo chưa xuất hiện trong báo cáo phân phối: {a.sourceOnlyAdIds.join(', ')}. Cần đối soát trước khi chốt phạm vi.</p>}
    <details><summary className="cursor-pointer text-sm">Xem các mã quảng cáo cần xác nhận điểm nhận</summary>
     <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Quảng cáo</th><th className="p-2">Tiền chi</th><th className="p-2">Hiển thị</th><th className="p-2">Nhấp</th></tr></thead><tbody>{a.ads.map(x=><tr key={x.adId}><td className="p-2">{x.adId}</td><td className="p-2">{money(x.amountVnd)}</td><td className="p-2">{x.impressions.toLocaleString('vi-VN')}</td><td className="p-2">{x.clicks.toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div>
    </details>
   </>}
  </article>)}
 </section>;
}
