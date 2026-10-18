import type { Plan } from "../../../packages/contracts/src/model.ts";
import { slotLabels } from "../../../packages/contracts/src/model.ts";
export function PlanGrid({ plan, tray }: { plan: Plan; tray?: number }) {
  return (
    <div className="plan-grids">
      {plan.trays
        .filter((t) => tray === undefined || t.number === tray)
        .map((t) => (
          <section key={t.number}>
            <div className="section-heading">
              <h3>{t.label}</h3>
              <small className="muted">
                计划数量 · {plan.startDate} 至 {plan.endDate}
              </small>
            </div>
            <div className="table-wrap">
              <table className="plan-grid">
                <thead>
                  <tr>
                    <th>时段 / 日期</th>
                    {plan.dates.map((date) => (
                      <th key={date}>
                        {Number(date.slice(5, 7))}月{Number(date.slice(8))}日
                        <small>
                          {new Intl.DateTimeFormat("zh-CN", {
                            weekday: "short",
                            timeZone: "UTC",
                          }).format(new Date(`${date}T00:00:00Z`))}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((slot, row) => (
                    <tr key={slot}>
                      <th>{slotLabels[slot]}</th>
                      {plan.dates.map((date, column) => (
                        <td key={date}>
                          {!plan.batches.some(
                            (b) =>
                              b.tray === t.number && b.matrix[row][column] > 0,
                          ) && <span className="cell-empty">—</span>}
                          {plan.batches
                            .filter(
                              (b) =>
                                b.tray === t.number &&
                                b.matrix[row][column] > 0,
                            )
                            .map((b) => (
                              <div className="cell-drug" key={b.id}>
                                <span>{b.name}</span>
                                <small className="cell-specification">
                                  {b.specification}
                                </small>
                                <strong>
                                  {b.matrix[row][column]}
                                  <small>
                                    {b.form === "half" ? " 颗半片" : " 颗"}
                                  </small>
                                </strong>
                              </div>
                            ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tray-totals">
              {plan.batches
                .filter((b) => b.tray === t.number)
                .map((b) => (
                  <div key={b.id}>
                    <span>
                      {b.name} <small>{b.specification}</small>
                    </span>
                    <strong>
                      {b.target} 颗
                      {b.form === "half" && (
                        <small> · 相当于 {b.originalTablets} 原片</small>
                      )}
                    </strong>
                  </div>
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}
