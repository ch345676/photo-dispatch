import {
  cents,
  payable as orderPayable,
  paid as orderPaid,
  balance as orderBalance,
} from "./domain.mjs";

// Input has already passed validateBackup; this summary never rewrites records.
export function summarizeBackup(data) {
  const totals = {
    amount: 0,
    travelAmount: 0,
    payable: 0,
    depositPaid: 0,
    settlementPaid: 0,
    paid: 0,
    balance: 0,
  };
  let unsettledOrders = 0;
  let dateFrom = "";
  let dateTo = "";

  for (const order of data.orders) {
    const remaining = orderBalance(order);
    totals.amount += cents(order.amount);
    totals.travelAmount += cents(order.travelAmount || 0);
    totals.payable += cents(orderPayable(order));
    totals.depositPaid += cents(order.depositPaid);
    totals.settlementPaid += cents(order.settlementPaid);
    // Ledger entries already contribute to these validated cumulative fields.
    totals.paid += cents(orderPaid(order));
    totals.balance += cents(remaining);
    if (remaining > 0) unsettledOrders += 1;
    if (!dateFrom || order.shootDate < dateFrom) dateFrom = order.shootDate;
    if (!dateTo || order.shootDate > dateTo) dateTo = order.shootDate;
  }

  return {
    orders: data.orders.length,
    trash: (data.trash || []).length,
    partners: data.partners.length,
    venues: data.venues.length,
    ...Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value / 100]),
    ),
    unsettledOrders,
    dateFrom,
    dateTo,
  };
}
