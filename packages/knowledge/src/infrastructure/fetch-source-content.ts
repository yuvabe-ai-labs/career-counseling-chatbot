// Fetches an official source page and reduces it to plain readable text for Gemini extraction
// (aid-schemes catalog pipeline — scripts/ingest/generate-ai-catalog-drafts.ts's --target
// aid_schemes). No HTML-parsing dependency exists anywhere in this repo (checked before writing
// this), so this is a deliberately small, dependency-free regex-based extractor rather than
// pulling in cheerio/jsdom for one pipeline. It only needs to turn government-portal HTML into
// readable text for an LLM prompt, not build a DOM or handle arbitrary web content robustly.
//
// Lives in packages/knowledge (not scripts/ingest) purely so it gets real unit test coverage —
// the root vitest config only includes apps/**/*.test.ts and packages/**/*.test.ts, never
// scripts/**, matching every other CLI script in scripts/ingest/ being thin, untested wiring
// around tested package functions.

export type FetchedSource = {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
};

export type FetchSourceResult =
  | { status: "fetched"; source: FetchedSource }
  | { status: "failed"; url: string; errorCode: string; message: string };

// Keeps a single source's prompt content bounded — a government scholarships page is a few
// thousand words at most; anything past this is almost always boilerplate nav/footer noise
// repeated across the site rather than more scheme content, and it keeps the Gemini prompt (and
// bill) predictable across very different source pages. 20,000 (not the original 15,000): some
// real official pages (e.g. a department's full site nav + scheme listing rendered as one page)
// run long enough that useful scheme content sat past the old cap — raised once aid_schemes got
// its own larger maxTokens budget (GEMINI_AID_SCHEME_MAX_TOKENS) made the extra input affordable.
const MAX_TEXT_LENGTH = 20_000;
const FETCH_TIMEOUT_MS = 20_000;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&ndash;": "-",
  "&mdash;": "-",
};

function decodeEntities(text: string): string {
  let result = text.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&nbsp;|&rsquo;|&lsquo;|&rdquo;|&ldquo;|&ndash;|&mdash;/g,
    (match) => HTML_ENTITIES[match] ?? match,
  );
  result = result.replace(/&#(\d+);/g, (_match, code: string) =>
    String.fromCodePoint(Number(code)),
  );
  return result;
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1]!).trim().replace(/\s+/g, " ") : "";
}

/** Strips scripts/styles/comments, then every remaining tag, then collapses whitespace — a
 *  readable-text extraction, not a layout-preserving one; good enough for an extraction prompt,
 *  not for re-rendering the page. */
function htmlToText(html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    // Block-level tags become paragraph breaks so extracted text stays readable instead of one
    // giant run-on line.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return text;
}

export async function fetchSourceContent(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<FetchSourceResult> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        // Several official Indian government portals reject requests with no browser-like
        // User-Agent (returns a 403 or a bot-block page instead of real content) — a real
        // browser UA string, not a generic Node one, is what actually gets real content back.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        status: "failed",
        url,
        errorCode: `http_${response.status}`,
        message: `Fetch returned HTTP ${response.status}`,
      };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return {
        status: "failed",
        url,
        errorCode: "unsupported_content_type",
        message: `Unsupported content-type: ${contentType || "(none)"} — PDF/binary sources are not handled by this fetcher yet`,
      };
    }
    const html = await response.text();
    const title = extractTitle(html);
    const text = htmlToText(html);
    if (text.trim().length === 0) {
      return { status: "failed", url, errorCode: "empty_content", message: "No readable text extracted from page" };
    }
    const truncated = text.length > MAX_TEXT_LENGTH;
    return {
      status: "fetched",
      source: { url, title, text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text, truncated },
    };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { status: "failed", url, errorCode: "fetch_timeout", message: "Fetch timed out" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", url, errorCode: "fetch_failed", message };
  }
}
