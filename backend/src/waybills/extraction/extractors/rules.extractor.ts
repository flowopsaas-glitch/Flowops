import { Injectable } from "@nestjs/common";
import { ExtractionResult } from "../../inbox/types";

@Injectable()
export class RulesExtractor {
  async extractFromMeta(input: { originalName: string; mimeType: string }): Promise<ExtractionResult> {
    const name = input.originalName || "";

    const wbMatch = name.match(/(WB[-_ ]?\d{4,})/i);
    const codeMatch = name.match(/\b([A-Z]\d{2,5})\b/); // e.g. Q94

    const waybillNo = wbMatch ? wbMatch[1].replace(/_/g, "-") : null;
    const contractCode = codeMatch ? codeMatch[1].toUpperCase() : null;

    const overall = (waybillNo ? 45 : 0) + (contractCode ? 30 : 0) + 15;

    return {
      overallConfidence: Math.max(10, Math.min(90, overall)),
      notes:
        "Rules-based extraction (no OCR yet). Next: OCR/AI reads waybill image and fills all fields + parcels.",
      waybillNo: waybillNo
        ? { value: waybillNo, confidence: 70, reason: "Inferred from filename" }
        : { value: null, confidence: 10, reason: "Not found in filename" },
      contractCode: contractCode
        ? { value: contractCode, confidence: 65, reason: "Inferred from filename token" }
        : { value: null, confidence: 15, reason: "No contract code token found" },
      paymentType: { value: "PREPAID", confidence: 40, reason: "Default until OCR detects COD" },
      codAmount: { value: 0, confidence: 40, reason: "Default until OCR detects COD amount" },
      chargeSide: { value: "SENDER", confidence: 45, reason: "Default (can be edited)" },
      parcels: {
        value: [{ qty: 1, weightKg: 2.5, lengthCm: 30, widthCm: 20, heightCm: 15 }],
        confidence: 35,
        reason: "Default sample parcel until OCR detects line items",
      },
    };
  }
}
