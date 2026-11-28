import { apiFetch } from "./client";
import { withPage, type Page, type PageQuery } from "./pagination";

export type CommercialQuery = PageQuery & {
  scoopId?: string;
  q?: string;
  category?: string;
  alert?: string;
  status?: string;
  paymentStatus?: string;
  fromDate?: string;
  toDate?: string;
  campaign?: string;
  crop?: string;
  channel?: string;
};

export type StockLotDto = {
  id: string;
  scoopId: string;
  organisationId: string | null;
  organisationName: string;
  itemName: string;
  category: string;
  lotNumber: string;
  unit: string;
  receivedQty: number;
  remainingQty: number;
  alertThreshold: number;
  unitPriceFcfa: number;
  supplier: string;
  receivedAt: string;
  expiresAt: string | null;
};

export type CreateStockLotBody = {
  scoopId: string;
  organisationId?: string;
  organisationName?: string;
  itemName: string;
  category?: string;
  lotNumber: string;
  unit: string;
  receivedQty: number;
  alertThreshold?: number;
  unitPriceFcfa: number;
  supplier?: string;
  receivedAt: string;
  expiresAt?: string;
};

export type StockMovementBody = {
  kind: "distribution" | "consommation" | "perte";
  quantity: number;
  memberId?: string;
  note?: string;
};

export type StockMovementDto = {
  id: string;
  lotId: string;
  scoopId: string;
  kind: "distribution" | "consommation" | "perte";
  quantity: number;
  memberId: string | null;
  note: string | null;
  recordedBy: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  createdAt: string;
};

export type CreditScheduleItemDto = {
  dueDate: string;
  amountFcfa: number;
};

export type CreditRepaymentDto = {
  id: string;
  creditId: string;
  scoopId: string;
  amountFcfa: number;
  paidAt: string;
  note: string | null;
  recordedBy: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  createdAt: string;
};

export type CreditDto = {
  id: string;
  scoopId: string;
  memberId: string;
  memberName: string;
  purpose: string;
  amountFcfa: number;
  ratePct: number;
  totalDueFcfa: number;
  repaidFcfa: number;
  grantedAt: string;
  nextDueAt: string | null;
  status: "en cours" | "soldé" | "en retard";
  schedule?: CreditScheduleItemDto[];
};

export type CreateCreditBody = {
  scoopId: string;
  memberId: string;
  memberName: string;
  purpose: string;
  amountFcfa: number;
  ratePct?: number;
  grantedAt: string;
  nextDueAt?: string;
  installments?: number;
  everyMonths?: number;
};

export type CreateRepaymentBody = {
  amountFcfa: number;
  paidAt: string;
  note?: string;
};

export type SalePaymentDto = {
  id: string;
  saleId: string;
  scoopId: string;
  amountFcfa: number;
  paidAt: string;
  note: string | null;
  recordedBy: string;
  createdAt: string;
};

export type SaleDto = {
  id: string;
  scoopId: string;
  producerId: string;
  producerName: string;
  crop: string;
  campaign: string;
  quantityKg: number;
  pricePerKgFcfa: number;
  totalFcfa: number;
  paidFcfa: number;
  paymentStatus: "payé" | "partiel" | "impayé";
  buyer: string;
  channel: "local" | "dakar" | "export" | "autre";
  saleDate: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
};

export type CreateSaleBody = {
  scoopId: string;
  producerId: string;
  producerName: string;
  crop: string;
  campaign?: string;
  quantityKg: number;
  pricePerKgFcfa: number;
  paidFcfa?: number;
  buyer?: string;
  channel?: "local" | "dakar" | "export" | "autre";
  saleDate: string;
};

function buildFilterParams(q: Omit<CommercialQuery, "page" | "limit">): URLSearchParams {
  const params = new URLSearchParams();
  if (q.scoopId) params.set("scoopId", q.scoopId);
  if (q.category) params.set("category", q.category);
  if (q.alert) params.set("alert", q.alert);
  if (q.status) params.set("status", q.status);
  if (q.paymentStatus) params.set("paymentStatus", q.paymentStatus);
  if (q.fromDate) params.set("fromDate", q.fromDate);
  if (q.toDate) params.set("toDate", q.toDate);
  if (q.campaign?.trim()) params.set("campaign", q.campaign.trim());
  if (q.crop?.trim()) params.set("crop", q.crop.trim());
  if (q.channel) params.set("channel", q.channel);
  if (q.q?.trim()) params.set("q", q.q.trim());
  return params;
}

function buildQuery(q: CommercialQuery): string {
  const qs = buildFilterParams(q).toString();
  return withPage(qs ? `?${qs}` : "", q);
}

export type CommercialStatsDto = {
  stocks: {
    totalLots: number;
    activeLots: number;
    totalValueFcfa: number;
    lowStockCount: number;
    expiringCount: number;
  } | null;
  credits: {
    totalCount: number;
    grantedFcfa: number;
    repaidFcfa: number;
    remainingFcfa: number;
    overdueCount: number;
    overdueFcfa: number;
  } | null;
  sales: {
    totalCount: number;
    totalQuantityKg: number;
    totalFcfa: number;
    collectedFcfa: number;
    receivableFcfa: number;
  } | null;
};

export function getCommercialStats(
  query: Omit<CommercialQuery, "page" | "limit"> | string = {},
): Promise<CommercialStatsDto> {
  const filters = typeof query === "string" ? { scoopId: query } : query;
  const qs = buildFilterParams(filters).toString();
  return apiFetch<CommercialStatsDto>(`/commercial/stats${qs ? `?${qs}` : ""}`);
}

export function listStockLots(query: CommercialQuery = {}): Promise<Page<StockLotDto>> {
  return apiFetch<Page<StockLotDto>>(`/commercial/stocks${buildQuery(query)}`);
}

export function createStockLot(body: CreateStockLotBody): Promise<StockLotDto> {
  return apiFetch<StockLotDto>("/commercial/stocks", { method: "POST", body });
}

export function recordStockMovement(
  lotId: string,
  body: StockMovementBody,
): Promise<{ lot: StockLotDto }> {
  return apiFetch<{ lot: StockLotDto }>(`/commercial/stocks/${lotId}/movements`, {
    method: "POST",
    body,
  });
}

export function listCredits(query: CommercialQuery = {}): Promise<Page<CreditDto>> {
  return apiFetch<Page<CreditDto>>(`/commercial/credits${buildQuery(query)}`);
}

export function createCredit(body: CreateCreditBody): Promise<CreditDto> {
  return apiFetch<CreditDto>("/commercial/credits", { method: "POST", body });
}

export function recordRepayment(
  creditId: string,
  body: CreateRepaymentBody,
): Promise<{ credit: CreditDto }> {
  return apiFetch<{ credit: CreditDto }>(`/commercial/credits/${creditId}/repayments`, {
    method: "POST",
    body,
  });
}

export function listSales(query: CommercialQuery = {}): Promise<Page<SaleDto>> {
  return apiFetch<Page<SaleDto>>(`/commercial/sales${buildQuery(query)}`);
}

export function createSale(body: CreateSaleBody): Promise<SaleDto> {
  return apiFetch<SaleDto>("/commercial/sales", { method: "POST", body });
}

export function listStockMovements(
  lotId: string,
  query: PageQuery = {},
): Promise<Page<StockMovementDto>> {
  return apiFetch<Page<StockMovementDto>>(
    withPage(`/commercial/stocks/${encodeURIComponent(lotId)}/movements`, query),
  );
}

export function cancelMovement(
  movementId: string,
  reason: string,
): Promise<{ lot: StockLotDto | null; movement: StockMovementDto }> {
  return apiFetch<{ lot: StockLotDto | null; movement: StockMovementDto }>(
    `/commercial/stock-movements/${encodeURIComponent(movementId)}/cancel`,
    { method: "POST", body: { reason } },
  );
}

export function listCreditRepayments(
  creditId: string,
  query: PageQuery = {},
): Promise<Page<CreditRepaymentDto>> {
  return apiFetch<Page<CreditRepaymentDto>>(
    withPage(`/commercial/credits/${encodeURIComponent(creditId)}/repayments`, query),
  );
}

export function cancelRepayment(
  repaymentId: string,
  reason: string,
): Promise<{ credit: CreditDto | null; repayment: CreditRepaymentDto }> {
  return apiFetch<{ credit: CreditDto | null; repayment: CreditRepaymentDto }>(
    `/commercial/repayments/${encodeURIComponent(repaymentId)}/cancel`,
    { method: "POST", body: { reason } },
  );
}

export function listSalePayments(
  saleId: string,
  query: PageQuery = {},
): Promise<Page<SalePaymentDto>> {
  return apiFetch<Page<SalePaymentDto>>(
    withPage(`/commercial/sales/${encodeURIComponent(saleId)}/payments`, query),
  );
}

export function recordSalePayment(
  saleId: string,
  body: CreateRepaymentBody,
): Promise<{ sale: SaleDto; payment: SalePaymentDto }> {
  return apiFetch<{ sale: SaleDto; payment: SalePaymentDto }>(
    `/commercial/sales/${encodeURIComponent(saleId)}/payments`,
    { method: "POST", body },
  );
}

export function cancelSale(saleId: string, reason: string): Promise<SaleDto> {
  return apiFetch<SaleDto>(`/commercial/sales/${encodeURIComponent(saleId)}/cancel`, {
    method: "POST",
    body: { reason },
  });
}
