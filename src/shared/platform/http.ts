/**
 * HTTP plumbing for the state machines.
 *
 * Machines never call `fetch` directly: they receive a {@link RequestFactory}
 * keyed by their query type and hand the outcome to a {@link ResponseHandler}.
 * Production injects {@link FetchRequestFactory}; tests inject a fake.
 */

import { z } from "zod";

/** An in-flight request that can be cancelled. */
export interface RequestHandle {
  cancel(): void;
}

/** Receives the outcome of a request created by a {@link RequestFactory}. */
export interface ResponseHandler {
  onResponse(response: Response): Promise<void>;
  onError(error: Error): Promise<void>;
  onCancel?(): Promise<void>;
}

/** Creates cancellable requests for a query of type Q. */
export interface RequestFactory<Q> {
  create(query: Q, handler: ResponseHandler): RequestHandle;
}

/** Production request factory, backed by `fetch` and `AbortController`. */
export class FetchRequestFactory<Q> implements RequestFactory<Q> {
  private readonly toUrl: (query: Q) => string;

  constructor(toUrl: (query: Q) => string) {
    this.toUrl = toUrl;
  }

  create = (query: Q, handler: ResponseHandler): RequestHandle => {
    const controller = new AbortController();
    fetch(this.toUrl(query), { signal: controller.signal })
      .then((response) => handler.onResponse(response))
      .catch((error: unknown) => {
        if ((error as { name?: unknown } | null)?.name === "AbortError") {
          handler.onCancel?.();
        } else {
          handler.onError(error instanceof Error ? error : new Error(String(error)));
        }
      });
    return { cancel: () => controller.abort() };
  };
}

export type ParsedResponse<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Reads a fetch `Response` as JSON and validates it against a Zod schema. */
export async function parseJsonResponse<S extends z.ZodType>(
  response: Response,
  schema: S,
  label: string,
): Promise<ParsedResponse<z.infer<S>>> {
  if (!response.ok) {
    return { ok: false, reason: `Request failed with status ${response.status}` };
  }
  try {
    return { ok: true, data: schema.parse(await response.json()) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(`Error validating ${label} response:`, error);
      return { ok: false, reason: "Error validating response" };
    }
    console.error(`Error parsing ${label} response:`, error);
    return { ok: false, reason: "Error parsing response" };
  }
}
