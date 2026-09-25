import { describe, expect, it, vi } from "vitest";
import { fetchSourceContent } from "../src/index.js";

function htmlResponse(html: string, init: { status?: number; contentType?: string } = {}): typeof globalThis.fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(html, {
        status: init.status ?? 200,
        headers: { "content-type": init.contentType ?? "text/html; charset=utf-8" },
      }),
    ),
  );
}

describe("fetchSourceContent", () => {
  it("extracts readable text and the page title from real-shaped government-portal HTML", async () => {
    const html = `
      <html>
        <head><title>Scholarships &mdash; Directorate of Collegiate Education</title></head>
        <body>
          <script>console.log("ignored");</script>
          <style>.x { color: red; }</style>
          <nav>Home | About | Contact</nav>
          <h1>Post-Metric Scholarship for SC/ST</h1>
          <p>Annual family income should not exceed Rs. 2.5 lakh.</p>
          <p>Apply through the official portal.</p>
        </body>
      </html>`;
    const fetch = htmlResponse(html);

    const result = await fetchSourceContent("https://tndce.tn.gov.in/Home/scholarship", fetch);

    expect(result.status).toBe("fetched");
    if (result.status !== "fetched") return;
    // &mdash;/&ndash; are normalized to a plain hyphen (see HTML_ENTITIES), not a literal em-dash.
    expect(result.source.title).toBe("Scholarships - Directorate of Collegiate Education");
    expect(result.source.text).toContain("Post-Metric Scholarship for SC/ST");
    expect(result.source.text).toContain("Annual family income should not exceed Rs. 2.5 lakh.");
    // Scripts/styles/nav markup must not leak into the extracted text.
    expect(result.source.text).not.toContain("console.log");
    expect(result.source.text).not.toContain("color: red");
    expect(result.source.truncated).toBe(false);
  });

  it("sends a real browser-like User-Agent — several official portals block requests without one", async () => {
    const fetch = htmlResponse("<html><body><p>content</p></body></html>");
    await fetchSourceContent("https://example.gov.in/", fetch);

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["user-agent"]).toMatch(/Mozilla/);
  });

  it("returns a failed result for a non-2xx HTTP status, without throwing", async () => {
    const fetch = htmlResponse("<html><body>Forbidden</body></html>", { status: 403 });

    const result = await fetchSourceContent("https://example.gov.in/", fetch);

    expect(result).toEqual({
      status: "failed",
      url: "https://example.gov.in/",
      errorCode: "http_403",
      message: "Fetch returned HTTP 403",
    });
  });

  it("rejects a non-HTML/text content-type (e.g. a PDF) rather than mangling binary content into text", async () => {
    const fetch = htmlResponse("%PDF-1.4 binary garbage", { contentType: "application/pdf" });

    const result = await fetchSourceContent("https://example.gov.in/scheme.pdf", fetch);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("unsupported_content_type");
    }
  });

  it("returns a failed result when the page has no extractable text (e.g. a JS-only shell)", async () => {
    const fetch = htmlResponse('<html><body><div id="app"></div></body></html>');

    const result = await fetchSourceContent("https://example.gov.in/", fetch);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("empty_content");
    }
  });

  it("returns a failed result on a network/fetch throw, without letting the exception propagate", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("getaddrinfo ENOTFOUND")));

    const result = await fetchSourceContent("https://example.gov.in/", fetch);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("fetch_failed");
      expect(result.message).toContain("ENOTFOUND");
    }
  });

  it("returns a failed result on a timeout, distinct from a generic fetch failure", async () => {
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "TimeoutError";
    const fetch = vi.fn(() => Promise.reject(timeoutError));

    const result = await fetchSourceContent("https://example.gov.in/", fetch);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("fetch_timeout");
    }
  });

  it("truncates very long pages and reports truncated: true", async () => {
    const longParagraph = `<p>${"word ".repeat(6000)}</p>`;
    const fetch = htmlResponse(`<html><body>${longParagraph}</body></html>`);

    const result = await fetchSourceContent("https://example.gov.in/", fetch);

    expect(result.status).toBe("fetched");
    if (result.status === "fetched") {
      expect(result.source.truncated).toBe(true);
      expect(result.source.text.length).toBeLessThanOrEqual(20_000);
    }
  });

  it("decodes common HTML entities instead of leaving them literal in extracted text", async () => {
    const fetch = htmlResponse(
      "<html><body><p>Fees &amp; charges &ndash; family income &lt; Rs. 2.5 lakh</p></body></html>",
    );

    const result = await fetchSourceContent("https://example.gov.in/", fetch);

    expect(result.status).toBe("fetched");
    if (result.status === "fetched") {
      expect(result.source.text).toContain("Fees & charges - family income < Rs. 2.5 lakh");
    }
  });
});
