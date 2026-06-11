import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import { ExtractionResult } from "../inbox/types";

type VisionExtractionJson = {
  overallConfidence?: number | null;
  notes?: string | null;

  waybillNo?: string | null;
  contractCode?: string | null;
  paymentType?: "PREPAID" | "COD" | null;
  codAmount?: number | null;
  chargeSide?: "SENDER" | "RECEIVER" | null;

  senderName?: string | null;
  senderPhone?: string | null;
  senderAddress1?: string | null;
  senderCity?: string | null;

  receiverName?: string | null;
  receiverPhone?: string | null;
  receiverAddress1?: string | null;
  receiverCity?: string | null;

  reference?: string | null;

  parcels?:
    | Array<{
        qty?: number | null;
        weightKg?: number | null;
        lengthCm?: number | null;
        widthCm?: number | null;
        heightCm?: number | null;
      }>
    | null;
};

export class VisionExtractionUnavailableError extends Error {
  code:
    | "VISION_DISABLED"
    | "VISION_API_KEY_MISSING"
    | "VISION_STORAGE_PATH_MISSING"
    | "VISION_UNSUPPORTED_FILE"
    | "VISION_FILE_READ_FAILED"
    | "VISION_FILE_EMPTY"
    | "VISION_FILE_TOO_LARGE"
    | "VISION_API_INSUFFICIENT_QUOTA"
    | "VISION_API_HTTP_ERROR"
    | "VISION_EMPTY_RESPONSE"
    | "VISION_NON_JSON_RESPONSE"
    | "VISION_REQUEST_FAILED";

  details?: string;

  constructor(
    code: VisionExtractionUnavailableError["code"],
    message: string,
    details?: string,
  ) {
    super(message);
    this.name = "VisionExtractionUnavailableError";
    this.code = code;
    this.details = details;
  }
}

@Injectable()
export class OpenAIWaybillVisionService {
  private readonly logger = new Logger(OpenAIWaybillVisionService.name);

  private readonly weakNameTokens = new Set<string>([
    "pt",
    "pte",
    "te",
    "tel",
    "cell",
    "phone",
    "name",
    "sender",
    "receiver",
    "consignee",
    "consignor",
    "address",
    "client",
    "customer",
    "attention",
    "attn",
    "ref",
    "reference",
    "contract",
    "code",
  ]);

  async extractFromStoredFile(args: {
    storagePath?: string | null;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }): Promise<ExtractionResult> {
    const enabledRaw = String(process.env.WAYBILL_VISION_ENABLED || "true").trim();
    const enabled = enabledRaw.toLowerCase() === "true";

    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    const storagePath = String(args.storagePath || "").trim();
    const originalName = String(args.originalName || "").trim();
    const incomingMimeType = String(args.mimeType || "").trim().toLowerCase();
    const sizeBytes = Number(args.sizeBytes || 0);
    const maxBytes = Number(process.env.WAYBILL_VISION_MAX_BYTES || 4000000);
    const model = String(process.env.WAYBILL_VISION_MODEL || "gpt-4.1-mini").trim();
    const timeoutMs = Number(process.env.WAYBILL_VISION_TIMEOUT_MS || 30000);

    this.logger.log(
      [
        "Vision extraction check",
        "enabled=" + String(enabled),
        "storagePath=" + storagePath,
        "originalName=" + originalName,
        "mimeType=" + incomingMimeType,
        "sizeBytes=" + String(sizeBytes),
        "model=" + model,
      ].join(" | "),
    );

    if (!enabled) {
      this.logger.warn("Skipping vision extraction because WAYBILL_VISION_ENABLED is not true");
      throw new VisionExtractionUnavailableError(
        "VISION_DISABLED",
        "AI vision is disabled by configuration.",
      );
    }

    if (!apiKey) {
      this.logger.warn("Skipping vision extraction because OPENAI_API_KEY is missing");
      throw new VisionExtractionUnavailableError(
        "VISION_API_KEY_MISSING",
        "AI vision is unavailable because OPENAI_API_KEY is missing.",
      );
    }

    if (!storagePath) {
      this.logger.warn("Skipping vision extraction because storagePath is empty");
      throw new VisionExtractionUnavailableError(
        "VISION_STORAGE_PATH_MISSING",
        "AI vision is unavailable because the stored file path is missing.",
      );
    }

    const absolutePath = this.resolveStoredPath(storagePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = this.normalizeMimeType(incomingMimeType, ext);

    if (!this.isSupportedVisionMime(mimeType, ext)) {
      this.logger.warn(
        "Skipping vision extraction because file type is unsupported for vision: " +
          "mimeType=" +
          mimeType +
          " ext=" +
          ext,
      );
      throw new VisionExtractionUnavailableError(
        "VISION_UNSUPPORTED_FILE",
        "AI vision does not support this file type for waybill extraction.",
        `mimeType=${mimeType} ext=${ext}`,
      );
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absolutePath);
      this.logger.log(
        "Stored file read successfully: " +
          absolutePath +
          " bytes=" +
          String(fileBuffer.length),
      );
    } catch (e: any) {
      const message = String(e?.message || e);
      this.logger.warn("Could not read stored file for vision extraction: " + message);
      throw new VisionExtractionUnavailableError(
        "VISION_FILE_READ_FAILED",
        "AI vision could not read the stored waybill file.",
        message,
      );
    }

    if (fileBuffer.length <= 0) {
      this.logger.warn("Skipping vision extraction because stored file is empty");
      throw new VisionExtractionUnavailableError(
        "VISION_FILE_EMPTY",
        "AI vision could not read the waybill because the stored file is empty.",
      );
    }

    if (fileBuffer.length > maxBytes) {
      this.logger.warn(
        "Skipping vision extraction because file is too large: " +
          String(fileBuffer.length) +
          " bytes (max " +
          String(maxBytes) +
          ")",
      );
      throw new VisionExtractionUnavailableError(
        "VISION_FILE_TOO_LARGE",
        "AI vision could not process the waybill because the file is too large.",
        `bytes=${fileBuffer.length} max=${maxBytes}`,
      );
    }

    const prompt = this.buildPrompt();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const isPdf = mimeType === "application/pdf";

      const userContent = isPdf
        ? [
            { type: "text", text: prompt },
            {
              type: "text",
              text:
                "The uploaded file is a PDF. Read the first visible waybill/shipping page and extract only what is clearly visible.",
            },
            {
              type: "file",
              file: {
                filename: originalName || path.basename(absolutePath),
                file_data: "data:" + mimeType + ";base64," + fileBuffer.toString("base64"),
              },
            } as any,
          ]
        : [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: "data:" + mimeType + ";base64," + fileBuffer.toString("base64"),
              },
            },
          ];

      this.logger.log(
        "Calling OpenAI vision model=" +
          model +
          " timeoutMs=" +
          String(timeoutMs) +
          " mimeType=" +
          mimeType,
      );

      const response = await fetch("https:/api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You extract structured logistics waybill data from scanned courier documents and images. Return strict JSON only.",
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          max_tokens: 1200,
        }),
        signal: controller.signal,
      });

      const rawResponseText = await response.text();

      if (!response.ok) {
        this.logger.warn(
          "OpenAI vision request failed with status=" +
            String(response.status) +
            " body=" +
            rawResponseText.slice(0, 1500),
        );

        if (response.status === 429 && rawResponseText.toLowerCase().includes("insufficient_quota")) {
          throw new VisionExtractionUnavailableError(
            "VISION_API_INSUFFICIENT_QUOTA",
            "AI vision is temporarily unavailable because the OpenAI project has insufficient quota.",
            rawResponseText.slice(0, 500),
          );
        }

        throw new VisionExtractionUnavailableError(
          "VISION_API_HTTP_ERROR",
          "AI vision request failed at the OpenAI API.",
          `status=${response.status} body=${rawResponseText.slice(0, 500)}`,
        );
      }

      this.logger.log("OpenAI vision response received successfully");

      let payload: {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
          };
        }>;
      } | null = null;

      try {
        payload = JSON.parse(rawResponseText) as {
          choices?: Array<{
            message?: {
              content?: string | Array<{ type?: string; text?: string }>;
            };
          }>;
        };
      } catch (e: any) {
        this.logger.warn(
          "OpenAI vision returned non-JSON API payload: " + String(e?.message || e),
        );
        throw new VisionExtractionUnavailableError(
          "VISION_NON_JSON_RESPONSE",
          "AI vision returned an unreadable API payload.",
          String(e?.message || e),
        );
      }

      const content = payload?.choices?.[0]?.message?.content;
      const rawText =
        typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
          ? content
              .map((x) => (typeof x?.text === "string" ? x.text : ""))
              .join("\n")
              .trim()
          : "";

      if (!rawText) {
        this.logger.warn("OpenAI vision returned empty content");
        throw new VisionExtractionUnavailableError(
          "VISION_EMPTY_RESPONSE",
          "AI vision returned no extraction content.",
        );
      }

      const parsed = this.safeParseJson(rawText);
      if (!parsed) {
        this.logger.warn(
          "OpenAI vision returned non-JSON content: " + rawText.slice(0, 1500),
        );
        throw new VisionExtractionUnavailableError(
          "VISION_NON_JSON_RESPONSE",
          "AI vision returned content that was not valid JSON.",
          rawText.slice(0, 500),
        );
      }

      const result = this.toExtractionResult(parsed, {
        fileName: originalName || path.basename(absolutePath),
        mimeType,
      });

      this.logger.log(
        "OpenAI vision parsed successfully with confidence=" +
          String(result.overallConfidence || 0),
      );

      return result;
    } catch (e: any) {
      if (e instanceof VisionExtractionUnavailableError) {
        throw e;
      }

      const message = String(e?.message || e);
      this.logger.warn("OpenAI vision request failed or timed out: " + message);

      throw new VisionExtractionUnavailableError(
        "VISION_REQUEST_FAILED",
        "AI vision request failed or timed out.",
        message,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPrompt(): string {
    return [
      "You are extracting structured courier waybill data from a single courier waybill image or PDF.",
      "Return JSON only. No markdown. No explanation. No code fences.",
      "If a field is not clearly visible, return null.",
      "Do not invent contract codes, phone numbers, cities, names, parcel dimensions, or COD amounts.",
      "Reject weak fake names such as PT, TE, PT TE, TEL, PHONE, SENDER, RECEIVER, CONSIGNEE, CONSIGNOR.",
      "Use these rules:",
      "- waybillNo: printed tracking/waybill/reference/shipping number only if clearly visible",
      "- contractCode: account code // client code // billing code only if clearly visible",
      "- paymentType: PREPAID or COD only if visible",
      "- chargeSide: SENDER or RECEIVER only if clearly implied",
      "- senderAddress1 and receiverAddress1 should be the most useful single-line address",
      "- senderCity and receiverCity should only be populated if clearly visible",
      "- parcels should be an array",
      "- if only one parcel total is visible, return one parcel row",
      "- overallConfidence must be 0..100",
      "Return this exact JSON shape:",
      JSON.stringify(
        {
          overallConfidence: 0,
          notes: "",
          waybillNo: null,
          contractCode: null,
          paymentType: null,
          codAmount: null,
          chargeSide: null,
          senderName: null,
          senderPhone: null,
          senderAddress1: null,
          senderCity: null,
          receiverName: null,
          receiverPhone: null,
          receiverAddress1: null,
          receiverCity: null,
          reference: null,
          parcels: [
            {
              qty: null,
              weightKg: null,
              lengthCm: null,
              widthCm: null,
              heightCm: null,
            },
          ],
        },
        null,
        2,
      ),
    ].join("\n");
  }

  private resolveStoredPath(storagePath: string): string {
    if (path.isAbsolute(storagePath)) {
      return storagePath;
    }

    return path.resolve(process.cwd(), storagePath);
  }

  private normalizeMimeType(incomingMimeType: string, ext: string): string {
    if (incomingMimeType) {
      return incomingMimeType;
    }

    switch (ext) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".webp":
        return "image/webp";
      case ".pdf":
        return "application/pdf";
      default:
        return "application/octet-stream";
    }
  }

  private isSupportedVisionMime(mimeType: string, ext: string): boolean {
    if (mimeType.startsWith("image/")) {
      return true;
    }

    if (mimeType === "application/pdf") {
      return true;
    }

    return ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || ext === ".pdf";
  }

  private safeParseJson(text: string): VisionExtractionJson | null {
    const trimmed = text.trim();

    try {
      return JSON.parse(trimmed) as VisionExtractionJson;
    } catch {}

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]) as VisionExtractionJson;
      } catch {}
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as VisionExtractionJson;
      } catch {}
    }

    return null;
  }

  private toExtractionResult(
    parsed: VisionExtractionJson,
    meta: { fileName: string; mimeType: string },
  ): ExtractionResult {
    const baseConfidence = this.normalizeConfidence(parsed.overallConfidence);
    const waybillNo = this.cleanWaybillNo(parsed.waybillNo);
    const contractCode = this.cleanContract(parsed.contractCode);
    const paymentType = this.cleanPaymentType(parsed.paymentType);
    const codAmount = this.toNumberOrNull(parsed.codAmount);
    const chargeSide = this.cleanChargeSide(parsed.chargeSide);

    const senderName = this.cleanPartyName(parsed.senderName);
    const senderPhone = this.cleanPhone(parsed.senderPhone);
    const senderAddress1 = this.cleanString(parsed.senderAddress1);
    const senderCity = this.cleanCity(parsed.senderCity);

    const receiverName = this.cleanPartyName(parsed.receiverName);
    const receiverPhone = this.cleanPhone(parsed.receiverPhone);
    const receiverAddress1 = this.cleanString(parsed.receiverAddress1);
    const receiverCity = this.cleanCity(parsed.receiverCity);

    const reference = this.cleanReference(parsed.reference);

    const parcels =
      Array.isArray(parsed.parcels) && parsed.parcels.length > 0
        ? parsed.parcels
            .map((p) => ({
              qty: this.toPositiveInt(p?.qty, 1),
              weightKg: this.toNumber(p?.weightKg, 0),
              lengthCm: this.toNumber(p?.lengthCm, 0),
              widthCm: this.toNumber(p?.widthCm, 0),
              heightCm: this.toNumber(p?.heightCm, 0),
            }))
            .filter(
              (p) =>
                p.qty > 0 ||
                p.weightKg > 0 ||
                p.lengthCm > 0 ||
                p.widthCm > 0 ||
                p.heightCm > 0,
            )
        : [];

    const notes = [
      "AI vision extraction completed.",
      "File: " + meta.fileName,
      "Type: " + meta.mimeType,
      this.cleanString(parsed.notes),
      !senderName && parsed.senderName ? "Weak sender name blocked." : null,
      !receiverName && parsed.receiverName ? "Weak receiver name blocked." : null,
    ]
      .filter(Boolean)
      .join(" ");

    const confidence = this.adjustConfidence(baseConfidence, {
      waybillNo,
      contractCode,
      senderName,
      receiverName,
      paymentType,
      parcelsCount: parcels.length,
    });

    return {
      overallConfidence: confidence,
      notes,

      waybillNo: this.field(waybillNo, confidence),
      contractCode: this.field(contractCode, confidence),
      paymentType: this.field(paymentType, confidence),
      codAmount: this.field(codAmount, confidence),
      chargeSide: this.field(chargeSide, confidence),

      senderName: this.field(senderName, confidence),
      senderPhone: this.field(senderPhone, confidence),
      senderAddress1: this.field(senderAddress1, confidence),
      senderCity: this.field(senderCity, confidence),

      receiverName: this.field(receiverName, confidence),
      receiverPhone: this.field(receiverPhone, confidence),
      receiverAddress1: this.field(receiverAddress1, confidence),
      receiverCity: this.field(receiverCity, confidence),

      reference: this.field(reference, confidence),
      parcels: {
        value: parcels,
        confidence,
        reason: "AI image extraction",
      },
    };
  }

  private field<T>(value: T | null, confidence: number) {
    return {
      value,
      confidence,
      reason: "AI image extraction",
    };
  }

  private normalizeConfidence(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private adjustConfidence(
    base: number,
    args: {
      waybillNo: string | null;
      contractCode: string | null;
      senderName: string | null;
      receiverName: string | null;
      paymentType: "PREPAID" | "COD" | null;
      parcelsCount: number;
    },
  ): number {
    let score = base;

    if (args.waybillNo) score += 8;
    if (args.contractCode) score += 8;
    if (args.senderName) score += 8;
    if (args.receiverName) score += 8;
    if (args.paymentType) score += 4;
    if (args.parcelsCount > 0) score += 4;

    if (!args.senderName) score -= 8;
    if (!args.receiverName) score -= 8;
    if (!args.contractCode) score -= 6;

    return Math.max(5, Math.min(98, Math.round(score)));
  }

  private cleanString(value: unknown): string | null {
    const s = String(value ?? "").replace(/\s+/g, " ").trim();
    return s ? s : null;
  }

  private cleanWaybillNo(value: unknown): string | null {
    const s = this.cleanString(value)?.toUpperCase() || null;
    if (!s) return null;
    const compact = s.replace(/\s+/g, "");
    if (!/^[A-Z0-9-]{4,40}$/.test(compact)) return null;
    return compact;
  }

  private cleanContract(value: unknown): string | null {
    const s = String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!s) return null;
    if (s.length < 3 || s.length > 12) return null;
    if (!/^[A-Z0-9]+$/.test(s)) return null;
    if (/^\d+$/.test(s)) return null;
    if (/^[A-Z]+$/.test(s)) return null;

    const hasLetter = /[A-Z]/.test(s);
    const hasDigit = /\d/.test(s);

    return hasLetter && hasDigit ? s : null;
  }

  private cleanPhone(value: unknown): string | null {
    const s = String(value ?? "").trim();
    if (!s) return null;

    const match = s.match(/(?:\+27|27|0)\s?(?:\d[\s-]?){8,10}/);
    return match ? match[0].replace(/\s+/g, " ").trim() : null;
  }

  private cleanPaymentType(value: unknown): "PREPAID" | "COD" | null {
    const s = String(value ?? "").trim().toUpperCase();
    if (s === "PREPAID" || s === "COD") return s;
    return null;
  }

  private cleanChargeSide(value: unknown): "SENDER" | "RECEIVER" | null {
    const s = String(value ?? "").trim().toUpperCase();
    if (s === "SENDER" || s === "RECEIVER") return s;
    return null;
  }

  private cleanReference(value: unknown): string | null {
    const s = this.cleanString(value);
    if (!s) return null;
    return s.length <= 60 ? s : s.slice(0, 60);
  }

  private cleanCity(value: unknown): string | null {
    const s = this.cleanString(value);
    if (!s) return null;
    if (s.length < 2 || s.length > 40) return null;
    return s;
  }

  private cleanPartyName(value: unknown): string | null {
    const s = this.cleanString(value);
    if (!s) return null;

    const lower = s.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);

    if (s.length < 4 || s.length > 80) return null;
    if (!/[a-z]/i.test(s)) return null;
    if (this.looksLikePhone(s)) return null;
    if (this.looksLikeEmail(s)) return null;
    if (this.looksLikeAddress(s)) return null;
    if (/^\d+$/.test(s)) return null;
    if (/^(pt|te|pt te)$/i.test(s)) return null;
    if (/^(mr|mrs|ms|dr)$/i.test(s)) return null;

    if (words.length > 0 && words.every((word) => this.weakNameTokens.has(word))) {
      return null;
    }

    if (words.length <= 2 && words.every((word) => word.length <= 2)) {
      return null;
    }

    return s;
  }

  private looksLikePhone(input: string): boolean {
    return /(?:\+27|27|0)\s?(?:\d[\s-]?){8,10}/i.test(input);
  }

  private looksLikeEmail(input: string): boolean {
    return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(input);
  }

  private looksLikeAddress(input: string): boolean {
    const lower = input.toLowerCase();
    const hints = [
      "street",
      "st ",
      "st.",
      "road",
      "rd",
      "avenue",
      "ave",
      "park",
      "industrial",
      "unit",
      "suite",
      "building",
      "warehouse",
      "shop",
      "plot",
      "farm",
      "box",
      "po box",
      "city",
      "suburb",
      "johannesburg",
      "pretoria",
      "durban",
      "cape town",
      "polokwane",
      "gauteng",
      "limpopo",
      "kzn",
      "kwazulu",
    ];

    return hints.some((x) => lower.includes(x)) || (/\d/.test(input) && input.length > 14);
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, ".").trim());
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const parsed = this.toNumber(value, Number.NaN);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const n = this.toNumber(value, fallback);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.round(n));
  }
}