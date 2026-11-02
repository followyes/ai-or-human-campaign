/** Read-only public catalog of levels from the NEW campaign Supabase. */
import { STAGES } from "./campaign-core.js";
import { buildPublicStorageUrl, resolveSupabasePublicConfig } from "./content-source.js";

const EXPECTED_COUNTS = Object.freeze([5, 5, 5, 5, 5, 10]);
const BUCKET = "game-images";
export class CampaignSourceError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, cause ? { cause } : undefined);
    this.name = "CampaignSourceError";
    this.code = code;
  }
}

function readRow(row) {
  if (!row || typeof row !== "object" || !Number.isInteger(row.level_id) ||
      row.level_id < 1 || row.level_id > 6 || !Number.isInteger(row.position) ||
      row.position < 1 || row.position > EXPECTED_COUNTS[row.level_id - 1] ||
      !["human", "ai"].includes(row.content_class) || typeof row.storage_path !== "string") {
    throw new CampaignSourceError("INVALID_ROW", "W bazie są błędne przypisania zdjęć do poziomów.");
  }
  const path = row.storage_path;
  if (!path.startsWith(`${row.content_class}/`) || !/\.(avif|webp|png|jpe?g)$/i.test(path)) {
    throw new CampaignSourceError("INVALID_PATH", "Ścieżka zdjęcia jest niespójna z kategorią AI / HUMAN.");
  }
  return row;
}

export function makeStagesFromRows(rows, projectUrl) {
  if (!Array.isArray(rows)) throw new CampaignSourceError("INVALID_RESPONSE", "Niepoprawna lista zdjęć.");
  if (!Number.isInteger(rows.length) || rows.length !== 35) return null;
  const positions = new Set();
  const images = STAGES.map(() => []);
  rows.forEach((input) => {
    const row = readRow(input);
    const positionKey = `${row.level_id}/${row.position}`;
    if (positions.has(positionKey)) throw new CampaignSourceError("DUPLICATE_POSITION", "Powtórzone pozycje zdjęć.");
    positions.add(positionKey);
    let src;
    try { src = buildPublicStorageUrl(projectUrl, BUCKET, row.storage_path); }
    catch (error) { throw new CampaignSourceError("INVALID_PATH", "Nieprawidłowa ścieżka obrazu.", error); }
    images[row.level_id - 1].push(Object.freeze({
      id: `db-${row.level_id}-${row.position}`, src, type: row.content_class, imagePosition: row.position - 1
    }));
  });
  for (let i = 0; i < EXPECTED_COUNTS.length; i++) {
    if (images[i].length !== EXPECTED_COUNTS[i]) {
      throw new CampaignSourceError("INCOMPLETE_LEVEL", `Poziom ${i + 1} ma niepoprawną liczbę zdjęć.`);
    }
    images[i].sort((a, b) => a.imagePosition - b.imagePosition);
  }
  return STAGES.map((stage, i) => Object.freeze({ ...stage, images: Object.freeze(images[i]) }));
}

export async function fetchCampaignStages({ config, fetchImpl = globalThis.fetch } = {}) {
  const resolved = resolveSupabasePublicConfig(config);
  if (!resolved.configured) return { ready: false, count: 0, stages: null };
  if (typeof fetchImpl !== "function") throw new CampaignSourceError("NO_FETCH", "Brak API fetch.");
  const url = new URL(`${resolved.projectUrl}/rest/v1/campaign_level_images`);
  url.searchParams.set("select", "level_id,position,content_class,storage_path");
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("order", "level_id.asc,position.asc");
  url.searchParams.set("limit", "36");
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET", cache: "no-store", headers: {
        Accept: "application/json", apikey: resolved.publishableKey
      }
    });
  } catch (error) {
    throw new CampaignSourceError("NETWORK", "Nie można połączyć się z bazą.", error);
  }
  if (!response?.ok) throw new CampaignSourceError("HTTP", `Baza zwróciła HTTP ${response?.status || "?"}.`);
  let rows;
  try { rows = await response.json(); }
  catch (error) { throw new CampaignSourceError("JSON", "Nieprawidłowa odpowiedź Supabase.", error); }
  if (!Array.isArray(rows)) throw new CampaignSourceError("INVALID_RESPONSE", "Baza nie zwróciła listy.");
  if (rows.length === 0 || rows.length < 35) return { ready: false, count: rows.length, stages: null };
  const stages = makeStagesFromRows(rows, resolved.projectUrl);
  if (!stages) throw new CampaignSourceError("COUNT", "Zbyt wiele zdjęć w kampanii.");
  return { ready: true, count: rows.length, stages };
}
