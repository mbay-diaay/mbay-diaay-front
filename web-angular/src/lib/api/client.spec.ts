import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ apiBaseUrl: () => "http://api.test/v1", isApiMode: () => true }));
vi.mock("./tokens", () => ({
  getAccessToken: () => "jeton",
  setAccessToken: vi.fn(),
  clearTokens: vi.fn(),
}));

const { apiFetch, ApiError, MAX_CONCURRENT_REQUESTS, MAX_RATE_LIMIT_RETRIES, retryDelayMs } = await import("./client");

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("apiFetch : 429 et simultanéité", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("réessaie après un 429 en respectant Retry-After, puis renvoie le résultat", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "Too Many Requests" }, 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const result = apiFetch<{ ok: boolean }>("/producers");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // l'attente de 3 s n'est pas terminée
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("abandonne après les tentatives prévues, avec un message clair (RATE_LIMITED)", async () => {
    fetchMock.mockImplementation(async () => json({ message: "Too Many Requests" }, 429, { "Retry-After": "1" }));
    const result = apiFetch("/producers");
    const settled = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120_000);
    const error = await settled;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).status).toBe(429);
    expect((error as InstanceType<typeof ApiError>).code).toBe("RATE_LIMITED");
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
  });

  it("ne réessaie pas une autre erreur (404, 500…)", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "NOT_FOUND", message: "Introuvable" }, 404));
    await expect(apiFetch("/producers/x")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("limite le nombre de demandes envoyées en même temps", async () => {
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      active--;
      return json({ ok: true });
    });
    const all = Promise.all(Array.from({ length: 20 }, (_, i) => apiFetch(`/x/${i}`)));
    await vi.advanceTimersByTimeAsync(1_000);
    await all;
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_REQUESTS);
  });

  it("l'attente suit Retry-After (jusqu'à 60 s) mais ne dépasse jamais 61 secondes", () => {
    const res = (value: string) => new Response("", { status: 429, headers: { "Retry-After": value } });
    expect(retryDelayMs(res("5"), 0)).toBeGreaterThanOrEqual(5_000);
    expect(retryDelayMs(res("60"), 0)).toBeGreaterThanOrEqual(60_000);
    expect(retryDelayMs(res("500"), 0)).toBeLessThanOrEqual(61_000);
    expect(retryDelayMs(new Response("", { status: 429 }), 0)).toBeGreaterThanOrEqual(1_500);
  });
});
