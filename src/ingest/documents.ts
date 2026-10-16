// Persists raw payloads to ingest_documents BEFORE any parsing happens, so
// re-normalizing never requires re-fetching (CLAUDE.md). content_hash lets a
// re-run skip a document whose upstream content hasn't changed, via the
// unique(source, endpoint, content_hash) index in db/schema.sql.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

export function hashContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export async function persistDocument(
  client: SupabaseClient<Database>,
  params: {
    runId: string;
    source: "programs_api" | "tigercenter";
    endpoint: string;
    requestParams: Record<string, Json>;
    body: string;
  },
): Promise<{ isNew: boolean; contentHash: string }> {
  const contentHash = hashContent(params.body);

  const { data: existing } = await client
    .from("ingest_documents")
    .select("id")
    .eq("source", params.source)
    .eq("endpoint", params.endpoint)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (existing) {
    return { isNew: false, contentHash };
  }

  const { error } = await client.from("ingest_documents").insert({
    run_id: params.runId,
    source: params.source,
    endpoint: params.endpoint,
    request_params: params.requestParams,
    payload: { body: params.body },
    content_hash: contentHash,
  });
  if (error) throw error;

  return { isNew: true, contentHash };
}

/** Fetches, persists the raw payload, and throws on a non-200 response
 * before anything tries to parse what's likely an error page. Shared by
 * both ingestion scripts. */
export async function fetchAndPersist(
  client: SupabaseClient<Database>,
  runId: string,
  source: "programs_api" | "tigercenter",
  fetchFn: () => Promise<{ endpoint: string; requestParams: Record<string, unknown>; status: number; body: string }>,
): Promise<string> {
  const raw = await fetchFn();
  await persistDocument(client, {
    runId,
    source,
    endpoint: raw.endpoint,
    requestParams: raw.requestParams as Record<string, Json>,
    body: raw.body,
  });
  if (raw.status !== 200) {
    throw new Error(`${raw.endpoint} returned HTTP ${raw.status}`);
  }
  return raw.body;
}
