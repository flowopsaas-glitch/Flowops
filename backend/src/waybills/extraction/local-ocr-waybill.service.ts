import { Injectable } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";

export type PartyMatchSide = "SENDER" | "RECEIVER";

export type ExtractedParty = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  rawBlock: string | null;
};

export type LocalOcrWaybillDraft = {
  waybillNo: string | null;
  orderDate: string | null;
  serviceLevel: string | null;
  paymentType: "PREPAID" | "COD";
  codAmount: string;
  chargeSide: "SENDER" | "RECEIVER";
  contractCode: string | null;
  reference: string | null;
  notes: string | null;
  senderName: string | null;
  senderPhone: string | null;
  senderEmail: string | null;
  senderAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverEmail: string | null;
  receiverAddress: string | null;
};

export type LocalOcrWaybillResult = {
  confidence: number;
  flags: string[];
  sender: ExtractedParty;
  receiver: ExtractedParty;
  draft: LocalOcrWaybillDraft;
};

export type ExtractFromStoredFileInput = {
  absolutePath?: string | null;
  filePath?: string | null;
  storedPath?: string | null;
  path?: string | null;
  mimeType?: string | null;
  originalName?: string | null;
  filename?: string | null;
};

@Injectable()
export class LocalOcrWaybillService {
  private readonly fakeOrWeakNameTokens = new Set<string>([
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

  private readonly senderMarkers = [
    "sender",
    "consignor",
    "shipper",
    "from",
    "collected from",
    "collection from",
    "pickup from",
    "collection address",
  ];

  private readonly receiverMarkers = [
    "receiver",
    "consignee",
    "to",
    "deliver to",
    "delivery to",
    "delivery address",
    "customer",
  ];

  async extractFromStoredFile(
    input: ExtractFromStoredFileInput,
  ): Promise<LocalOcrWaybillResult> {
    const resolvedPath =
      input.absolutePath ??
      input.filePath ??
      input.storedPath ??
      input.path ??
      null;

    if (!resolvedPath) {
      return this.buildFailedResult("No stored file path provided for local OCR.");
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = (input.mimeType ?? "").toLowerCase();
    const originalName = input.originalName ?? input.filename ?? path.basename(resolvedPath);

    try {
      if (this.isPlainTextLike(ext, mimeType)) {
        const fileText = await fs.readFile(resolvedPath, "utf8");
        const result = this.extract(fileText);

        result.flags.unshift(`Local OCR source loaded from stored file: ${originalName}`);
        result.draft.notes = this.prependNote(
          result.draft.notes,
          `Local OCR source loaded from stored file: ${originalName}`,
        );

        return result;
      }

      const fallback = this.buildFailedResult(
        `Stored file type not supported by this local text OCR parser: ${ext || mimeType || "unknown"}`,
      );

      fallback.flags.unshift(`File received: ${originalName}`);
      fallback.draft.notes = this.prependNote(
        fallback.draft.notes,
        `File received: ${originalName}`,
      );

      return fallback;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown file read error";

      return this.buildFailedResult(
        `Local OCR failed to read stored file "${originalName}": ${message}`,
      );
    }
  }

  extract(text: string): LocalOcrWaybillResult {
    const normalized = this.normalizeText(text);
    const lines = this.lines(normalized);

    const flags: string[] = [];

    const senderBlock = this.findBestPartyBlock(lines, this.senderMarkers);
    const receiverBlock = this.findBestPartyBlock(lines, this.receiverMarkers);

    const sender = this.extractParty(senderBlock, "SENDER");
    const receiver = this.extractParty(receiverBlock, "RECEIVER");

    const waybillNo = this.extractWaybillNo(normalized);
    const orderDate = this.extractOrderDate(normalized);
    const serviceLevel = this.extractServiceLevel(normalized);
    const paymentType = this.extractPaymentType(normalized);
    const codAmount = this.extractCodAmount(normalized);
    const chargeSide = this.extractChargeSide(normalized, paymentType);
    const contractCode = this.extractContractCode(normalized);
    const reference = this.extractReference(normalized);

    if (!sender.name) flags.push("Sender name not confidently detected");
    if (!receiver.name) flags.push("Receiver name not confidently detected");
    if (!waybillNo) flags.push("Waybill number not detected");
    if (!contractCode) flags.push("Contract code not detected");

    if (sender.name && this.looksFakeName(sender.name)) {
      flags.push(`Blocked weak sender name candidate: ${sender.name}`);
    }
    if (receiver.name && this.looksFakeName(receiver.name)) {
      flags.push(`Blocked weak receiver name candidate: ${receiver.name}`);
    }

    const confidence = this.calculateConfidence({
      sender,
      receiver,
      waybillNo,
      contractCode,
      paymentType,
      codAmount,
      serviceLevel,
      reference,
      orderDate,
      flags,
    });

    const draft: LocalOcrWaybillDraft = {
      waybillNo,
      orderDate,
      serviceLevel,
      paymentType,
      codAmount,
      chargeSide,
      contractCode,
      reference,
      notes: this.buildNotes({
        confidence,
        flags,
        sender,
        receiver,
        serviceLevel,
        paymentType,
        codAmount,
        contractCode,
        reference,
      }),
      senderName: sender.name,
      senderPhone: sender.phone,
      senderEmail: sender.email,
      senderAddress: sender.address,
      receiverName: receiver.name,
      receiverPhone: receiver.phone,
      receiverEmail: receiver.email,
      receiverAddress: receiver.address,
    };

    return {
      confidence,
      flags,
      sender,
      receiver,
      draft,
    };
  }

  private buildFailedResult(reason: string): LocalOcrWaybillResult {
    const flags = [reason];
    const sender: ExtractedParty = {
      name: null,
      phone: null,
      email: null,
      address: null,
      rawBlock: null,
    };
    const receiver: ExtractedParty = {
      name: null,
      phone: null,
      email: null,
      address: null,
      rawBlock: null,
    };

    return {
      confidence: 10,
      flags,
      sender,
      receiver,
      draft: {
        waybillNo: null,
        orderDate: null,
        serviceLevel: null,
        paymentType: "PREPAID",
        codAmount: "0",
        chargeSide: "SENDER",
        contractCode: null,
        reference: null,
        notes: this.buildNotes({
          confidence: 10,
          flags,
          sender,
          receiver,
          serviceLevel: null,
          paymentType: "PREPAID",
          codAmount: "0",
          contractCode: null,
          reference: null,
        }),
        senderName: null,
        senderPhone: null,
        senderEmail: null,
        senderAddress: null,
        receiverName: null,
        receiverPhone: null,
        receiverEmail: null,
        receiverAddress: null,
      },
    };
  }

  private prependNote(existing: string | null, line: string): string {
    if (!existing || !existing.trim()) {
      return line;
    }

    return `${line}\n${existing}`;
  }

  private isPlainTextLike(ext: string, mimeType: string): boolean {
    return (
      ext === ".txt" ||
      ext === ".text" ||
      ext === ".csv" ||
      ext === ".json" ||
      ext === ".log" ||
      ext === ".md" ||
      mimeType.includes("text/plain") ||
      mimeType.includes("application/json") ||
      mimeType.includes("text/csv")
    );
  }

  private normalizeText(input: string): string {
    return input
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[|]/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
  }

  private lines(input: string): string[] {
    return input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private findBestPartyBlock(lines: string[], markers: string[]): string[] {
    let bestIndex = -1;

    for (let i = 0; i < lines.length; i += 1) {
      const lower = lines[i].toLowerCase();
      if (markers.some((marker) => lower.includes(marker))) {
        bestIndex = i;
        break;
      }
    }

    if (bestIndex === -1) {
      return [];
    }

    const block: string[] = [];
    for (let i = bestIndex; i < Math.min(lines.length, bestIndex + 7); i += 1) {
      const current = lines[i].trim();
      if (!current) break;

      if (
        i > bestIndex &&
        this.isBoundaryLine(current) &&
        !this.looksLikeAddress(current)
      ) {
        break;
      }

      block.push(current);
    }

    return block;
  }

  private isBoundaryLine(line: string): boolean {
    const lower = line.toLowerCase();

    return (
      this.senderMarkers.some((m) => lower.includes(m)) ||
      this.receiverMarkers.some((m) => lower.includes(m)) ||
      lower.includes("waybill") ||
      lower.includes("tracking") ||
      lower.includes("service level") ||
      lower.includes("payment") ||
      lower.includes("contract code") ||
      lower.includes("reference") ||
      lower.includes("cod")
    );
  }

  private extractParty(block: string[], side: PartyMatchSide): ExtractedParty {
    if (!block.length) {
      return {
        name: null,
        phone: null,
        email: null,
        address: null,
        rawBlock: null,
      };
    }

    const joined = block.join(" | ");
    const phone = this.extractPhone(joined);
    const email = this.extractEmail(joined);
    const address = this.extractAddress(block, side);
    const name = this.extractPartyName(block, side);

    return {
      name,
      phone,
      email,
      address,
      rawBlock: block.join("\n"),
    };
  }

  private extractPartyName(block: string[], side: PartyMatchSide): string | null {
    const cleanedCandidates: string[] = [];

    for (const rawLine of block) {
      const line = this.stripFieldLabel(rawLine);
      if (!line) continue;

      const lower = line.toLowerCase();

      if (this.looksLikePhone(line)) continue;
      if (this.looksLikeEmail(line)) continue;
      if (this.looksLikeAddress(line)) continue;
      if (lower.includes("contract code")) continue;
      if (lower.includes("reference")) continue;
      if (lower.includes("waybill")) continue;
      if (lower.includes("service level")) continue;
      if (lower.includes("payment")) continue;
      if (lower.includes("cod")) continue;

      const splitParts = line
        .split(/[|,:;]/)
        .map((part) => part.trim())
        .filter(Boolean);

      for (const part of splitParts) {
        const maybeName = this.cleanNameCandidate(part);
        if (!maybeName) continue;
        cleanedCandidates.push(maybeName);
      }
    }

    const uniqueCandidates = Array.from(new Set(cleanedCandidates));

    for (const candidate of uniqueCandidates) {
      if (this.isStrongHumanOrBusinessName(candidate, side)) {
        return candidate;
      }
    }

    return null;
  }

  private cleanNameCandidate(input: string): string | null {
    let value = input
      .replace(/\b(sender|receiver|consignee|consignor|shipper|customer|name|from|to)\b/gi, "")
      .replace(/\b(attn|attention)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    value = value.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9)]+$/, "").trim();

    if (!value) return null;
    if (value.length < 3) return null;

    return value;
  }

  private isStrongHumanOrBusinessName(value: string, side: PartyMatchSide): boolean {
    const compact = value.trim();
    const lower = compact.toLowerCase();

    if (!compact) return false;
    if (compact.length < 4) return false;
    if (compact.length > 80) return false;

    if (this.looksFakeName(compact)) return false;
    if (this.looksLikePhone(compact)) return false;
    if (this.looksLikeEmail(compact)) return false;
    if (this.looksLikeAddress(compact)) return false;
    if (/^\d+$/.test(compact)) return false;
    if (!/[A-Za-z]/.test(compact)) return false;

    const words = compact.split(/\s+/).filter(Boolean);
    if (words.length === 1 && words[0].length < 5) return false;

    const weakWords = words.filter((word) =>
      this.fakeOrWeakNameTokens.has(word.toLowerCase()),
    );
    if (weakWords.length === words.length) return false;

    const alphaWords = words.filter((word) => /[A-Za-z]/.test(word));
    if (alphaWords.length === 0) return false;

    if (compact === compact.toUpperCase() && compact.length <= 4) return false;

    const suspiciousShortPattern =
      words.length <= 2 &&
      words.every(
        (word) =>
          word.length <= 2 || this.fakeOrWeakNameTokens.has(word.toLowerCase()),
      );

    if (suspiciousShortPattern) return false;

    if (side === "SENDER" || side === "RECEIVER") {
      if (/^(pt\s+te)$/i.test(lower)) return false;
      if (/^(mr|mrs|ms|dr)$/i.test(lower)) return false;
    }

    return true;
  }

  private looksFakeName(value: string): boolean {
    const cleaned = value.trim().toLowerCase();
    const words = cleaned.split(/\s+/).filter(Boolean);

    if (!cleaned) return true;
    if (cleaned === "pt te") return true;
    if (cleaned === "pt") return true;
    if (cleaned === "te") return true;

    if (words.length > 0 && words.every((word) => this.fakeOrWeakNameTokens.has(word))) {
      return true;
    }

    if (words.length <= 2 && words.every((word) => word.length <= 2)) {
      return true;
    }

    if (/^(tel|cell|phone)\b/i.test(cleaned)) {
      return true;
    }

    return false;
  }

  private stripFieldLabel(line: string): string {
    return line
      .replace(
        /^(sender|receiver|consignee|consignor|shipper|customer|name|from|to|attn|attention)\s*[:\-]?\s*/i,
        "",
      )
      .trim();
  }

  private extractAddress(block: string[], _side: PartyMatchSide): string | null {
    const addressLines = block
      .map((line) => this.stripFieldLabel(line))
      .filter((line) => this.looksLikeAddress(line));

    if (!addressLines.length) return null;

    return addressLines.join(", ").replace(/\s{2,}/g, " ").trim();
  }

  private looksLikeAddress(value: string): boolean {
    const lower = value.toLowerCase();

    const addressHints = [
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
      "ext",
      "extension",
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

    const hasHint = addressHints.some((hint) => lower.includes(hint));
    const hasNumber = /\d/.test(value);

    return hasHint || (hasNumber && value.length > 14);
  }

  private extractPhone(input: string): string | null {
    const matches = input.match(/(?:\+27|27|0)\s?(?:\d[\s-]?){8,10}/g);
    if (!matches || !matches.length) return null;

    const cleaned = matches
      .map((m) => m.replace(/[^\d+]/g, ""))
      .sort((a, b) => b.length - a.length);

    return cleaned[0] ?? null;
  }

  private looksLikePhone(input: string): boolean {
    return /(?:\+27|27|0)\s?(?:\d[\s-]?){8,10}/i.test(input);
  }

  private extractEmail(input: string): string | null {
    const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] ?? null;
  }

  private looksLikeEmail(input: string): boolean {
    return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(input);
  }

  private extractWaybillNo(input: string): string | null {
    const patterns = [
      /\b(?:waybill|wb|tracking|tracking no|tracking number|awb)\s*[:#-]?\s*([A-Z0-9-]{5,30})\b/i,
      /\b([A-Z]{1,4}\d{4,12})\b/,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match?.[1]) {
        return match[1].trim().toUpperCase();
      }
    }

    return null;
  }

  private extractOrderDate(input: string): string | null {
    const patterns = [
      /\b(?:date|order date|booking date|collection date)\s*[:\-]?\s*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/i,
      /\b(?:date|order date|booking date|collection date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  private extractServiceLevel(input: string): string | null {
    const patterns: Array<{ regex: RegExp; value: string }> = [
      { regex: /\bsame\s*day\b/i, value: "Same Day" },
      { regex: /\bnext\s*day\b/i, value: "Next Day" },
      { regex: /\bovernight\b/i, value: "Overnight" },
      { regex: /\beconomy\b/i, value: "Economy" },
      { regex: /\bexpress\b/i, value: "Express" },
      { regex: /\broad\s*freight\b/i, value: "Road Freight" },
    ];

    for (const item of patterns) {
      if (item.regex.test(input)) {
        return item.value;
      }
    }

    const explicit = input.match(
      /\b(?:service level|service|delivery type)\s*[:\-]?\s*([A-Za-z ]{3,40})\b/i,
    );

    if (explicit?.[1]) {
      return explicit[1].trim().replace(/\s{2,}/g, " ");
    }

    return null;
  }

  private extractPaymentType(input: string): "PREPAID" | "COD" {
    if (/\bcod\b|\bcash on delivery\b/i.test(input)) {
      return "COD";
    }

    return "PREPAID";
  }

  private extractCodAmount(input: string): string {
    const match = input.match(
      /\b(?:cod|cash on delivery)\b(?: amount)?\s*[:\-]?\s*(?:r\s*)?(\d+(?:[.,]\d{1,2})?)/i,
    );

    if (!match?.[1]) return "0";

    return match[1].replace(",", ".");
  }

  private extractChargeSide(
    input: string,
    paymentType: "PREPAID" | "COD",
  ): "SENDER" | "RECEIVER" {
    if (paymentType === "COD") {
      return "RECEIVER";
    }

    if (/\b(receiver pays|consignee pays|collect)\b/i.test(input)) {
      return "RECEIVER";
    }

    return "SENDER";
  }

  private extractContractCode(input: string): string | null {
    const patterns = [
      /\bcontract\s*code\s*[:#-]?\s*([A-Z]{1,5}\d{1,8}[A-Z]?)\b/i,
      /\baccount\s*code\s*[:#-]?\s*([A-Z]{1,5}\d{1,8}[A-Z]?)\b/i,
      /\bclient\s*code\s*[:#-]?\s*([A-Z]{1,5}\d{1,8}[A-Z]?)\b/i,
      /\b(?:ref|reference)\s*[:#-]?\s*([A-Z]{1,4}\d{2,8})\b/i,
      /\b([A-Z]{1,4}\d{2,8})\b/g,
    ];

    for (const pattern of patterns) {
      if (pattern.global) {
        const matches = Array.from(input.matchAll(pattern));
        for (const match of matches) {
          const candidate = match[1]?.trim().toUpperCase();
          if (this.isStrongContractCode(candidate)) {
            return candidate;
          }
        }
      } else {
        const match = input.match(pattern);
        const candidate = match?.[1]?.trim().toUpperCase() ?? null;
        if (this.isStrongContractCode(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  private isStrongContractCode(value: string | null): boolean {
    if (!value) return false;
    if (value.length < 3) return false;
    if (value.length > 12) return false;
    if (!/^[A-Z0-9]+$/.test(value)) return false;
    if (/^\d+$/.test(value)) return false;
    if (/^[A-Z]+$/.test(value)) return false;

    const hasLetter = /[A-Z]/.test(value);
    const hasDigit = /\d/.test(value);

    return hasLetter && hasDigit;
  }

  private extractReference(input: string): string | null {
    const match = input.match(
      /\b(?:reference|customer ref|order ref|invoice ref|po number|po no)\s*[:#-]?\s*([A-Z0-9/_-]{3,40})\b/i,
    );

    return match?.[1]?.trim() ?? null;
  }

  private calculateConfidence(args: {
    sender: ExtractedParty;
    receiver: ExtractedParty;
    waybillNo: string | null;
    contractCode: string | null;
    paymentType: "PREPAID" | "COD";
    codAmount: string;
    serviceLevel: string | null;
    reference: string | null;
    orderDate: string | null;
    flags: string[];
  }): number {
    let score = 35;

    if (args.sender.name) score += 12;
    if (args.receiver.name) score += 12;
    if (args.sender.phone || args.sender.address) score += 5;
    if (args.receiver.phone || args.receiver.address) score += 5;
    if (args.waybillNo) score += 12;
    if (args.contractCode) score += 8;
    if (args.serviceLevel) score += 4;
    if (args.reference) score += 3;
    if (args.orderDate) score += 2;

    if (args.paymentType === "COD" && args.codAmount !== "0") {
      score += 2;
    }

    score -= args.flags.length * 4;

    if (score < 10) return 10;
    if (score > 98) return 98;

    return score;
  }

  private buildNotes(args: {
    confidence: number;
    flags: string[];
    sender: ExtractedParty;
    receiver: ExtractedParty;
    serviceLevel: string | null;
    paymentType: "PREPAID" | "COD";
    codAmount: string;
    contractCode: string | null;
    reference: string | null;
  }): string {
    const notes: string[] = [];

    notes.push("Local OCR extraction completed.");
    notes.push(`Confidence: ${args.confidence}%`);
    notes.push(`Payment type detected: ${args.paymentType}`);

    if (args.serviceLevel) {
      notes.push(`Service level detected: ${args.serviceLevel}`);
    }

    if (args.codAmount && args.codAmount !== "0") {
      notes.push(`COD amount detected: ${args.codAmount}`);
    }

    if (args.contractCode) {
      notes.push(`Contract code detected: ${args.contractCode}`);
    }

    if (args.reference) {
      notes.push(`Reference detected: ${args.reference}`);
    }

    if (args.sender.name) {
      notes.push(`Sender matched: ${args.sender.name}`);
    }

    if (args.receiver.name) {
      notes.push(`Receiver matched: ${args.receiver.name}`);
    }

    if (args.flags.length) {
      notes.push(`Review flags: ${args.flags.join(" | ")}`);
    }

    return notes.join("\n");
  }
}