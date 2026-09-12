import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  FetchRequestFactory,
  parseJsonResponse,
  type ResponseHandler,
} from "@/shared/platform/http";

const createHandler = (): ResponseHandler & {
  responses: Response[];
  errors: Error[];
  cancels: number;
} => ({
  responses: [],
  errors: [],
  cancels: 0,
  async onResponse(response) {
    this.responses.push(response);
  },
  async onError(error) {
    this.errors.push(error);
  },
  async onCancel() {
    this.cancels += 1;
  },
});

/** Flushes the microtask queue so the fetch promise chain settles */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("FetchRequestFactory", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the mapped URL and delivers the response to onResponse", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const factory = new FetchRequestFactory((q: string) => `https://example.com/${q}`);
    const handler = createHandler();
    factory.create("query", handler);
    await settle();

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/query", expect.anything());
    expect(handler.responses).toHaveLength(1);
    expect(handler.errors).toHaveLength(0);
  });

  it("maps our own cancellation to onCancel, not onError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          }),
      ),
    );

    const factory = new FetchRequestFactory((q: string) => q);
    const handler = createHandler();
    factory.create("query", handler).cancel();
    await settle();

    expect(handler.cancels).toBe(1);
    expect(handler.errors).toHaveLength(0);
  });

  it("maps network failures to onError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const factory = new FetchRequestFactory((q: string) => q);
    const handler = createHandler();
    factory.create("query", handler);
    await settle();

    expect(handler.errors).toHaveLength(1);
    expect(handler.errors[0].message).toBe("Failed to fetch");
    expect(handler.cancels).toBe(0);
  });

  it("wraps non-Error rejections in an Error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("boom"));

    const factory = new FetchRequestFactory((q: string) => q);
    const handler = createHandler();
    factory.create("query", handler);
    await settle();

    expect(handler.errors).toHaveLength(1);
    expect(handler.errors[0]).toBeInstanceOf(Error);
    expect(handler.errors[0].message).toBe("boom");
  });
});

describe("parseJsonResponse", () => {
  const schema = z.object({ value: z.number() });

  it("returns validated data for a well-formed 2xx response", async () => {
    const response = new Response(JSON.stringify({ value: 42 }), { status: 200 });
    const result = await parseJsonResponse(response, schema, "test");
    expect(result).toEqual({ ok: true, data: { value: 42 } });
  });

  it("reports the status for a non-2xx response without reading the body", async () => {
    const response = new Response(null, { status: 503 });
    const result = await parseJsonResponse(response, schema, "test");
    expect(result).toEqual({ ok: false, reason: "Request failed with status 503" });
  });

  it("distinguishes a schema mismatch from malformed JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mismatch = new Response(JSON.stringify({ value: "nope" }), { status: 200 });
    expect(await parseJsonResponse(mismatch, schema, "test")).toEqual({
      ok: false,
      reason: "Error validating response",
    });

    const malformed = new Response("not json at all", { status: 200 });
    expect(await parseJsonResponse(malformed, schema, "test")).toEqual({
      ok: false,
      reason: "Error parsing response",
    });
  });
});
