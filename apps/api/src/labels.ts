import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Resident } from "../../../packages/contracts/src/model.ts";
import {
  labelLayout,
  residentBarcode,
} from "../../../packages/contracts/src/model.ts";
export async function labelsPdf(
  residents: Resident[],
  copies: number,
): Promise<Buffer> {
  const document = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const supplied =
    process.env.PILLXA_FONT_FILE ||
    resolve("assets/fonts/NotoSansCJKsc-Regular.otf");
  const font = existsSync(supplied) ? supplied : "C:/Windows/Fonts/msyh.ttc";
  if (!existsSync(font)) throw new Error("中文标签字体未配置");
  if (font.endsWith(".ttc")) document.font(font, "MicrosoftYaHei");
  else document.font(font);
  const mm = (value: number) => (value * 72) / 25.4;
  const width = mm(labelLayout.widthMm);
  const gap = mm(labelLayout.gapMm);
  const left = mm(labelLayout.leftMm);
  const top = mm(labelLayout.topMm);
  const perPage = labelLayout.columns * labelLayout.rows;
  let index = 0;
  for (const resident of residents) {
    const qr = await bwipjs.toBuffer({
      bcid: "qrcode",
      text: residentBarcode(resident.id),
      scale: 3,
      padding: 0,
    });
    for (let copy = 0; copy < copies; copy++) {
      if (index % perPage === 0) document.addPage();
      const cell = index % perPage;
      const x = left + (cell % labelLayout.columns) * (width + gap);
      const y = top + Math.floor(cell / labelLayout.columns) * (width + gap);
      document
        .roundedRect(x, y, width, width, 2)
        .lineWidth(0.3)
        .strokeColor("#d8dee7")
        .stroke();
      document.image(qr, x + mm(4), y + mm(1), {
        width: mm(labelLayout.qrMm),
        height: mm(labelLayout.qrMm),
      });
      document
        .fillColor("#162b35")
        .fontSize(6)
        .text(resident.name, x + 2, y + mm(15.2), {
          width: width - 4,
          height: mm(3),
          align: "center",
          lineBreak: false,
        });
      document.fontSize(5).text(resident.bed || "无床位", x + 2, y + mm(18.5), {
        width: width - 4,
        height: mm(2.5),
        align: "center",
        lineBreak: false,
      });
      index++;
    }
  }
  if (index === 0) document.addPage();
  document.end();
  return result;
}
