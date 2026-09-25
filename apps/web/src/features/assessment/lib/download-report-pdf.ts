// "<name>-Journey-Report.pdf", with anything a filename can't hold replaced.
function reportFileName(firstName: string | undefined): string {
  const safe = (firstName ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "My"}-Journey-Report.pdf`;
}

/**
 * Renders the report panel to an image and saves it as a one-page A4 PDF named after the student.
 * Both libraries are loaded on demand so they only cost anything when someone actually downloads.
 */
export async function downloadReportPdf(
  panel: HTMLElement,
  firstName: string | undefined,
): Promise<void> {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const image = await toJpeg(panel, { pixelRatio: 2, quality: 0.92, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 10;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = (panel.offsetHeight / panel.offsetWidth) * width;
  pdf.addImage(image, "JPEG", margin, margin, width, height);
  pdf.save(reportFileName(firstName));
}
