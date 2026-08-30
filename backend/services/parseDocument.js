const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = "gemini-3.6-flash";

const PROMPTS = {
  po: `You are extracting structured data from a Purchase Order document image/PDF.
Return ONLY valid JSON, no markdown fences, no explanation, matching exactly this shape:
{ "poNumber": string, "poDate": string (ISO 8601), "vendorName": string, "items": [{ "itemCode": string, "description": string, "quantity": number }] }.
If a field is not visible, use null. Extract every line item, do not skip any.`,

  grn: `You are extracting structured data from a Goods Receipt Note (GRN) document image/PDF.
Return ONLY valid JSON, no markdown fences, no explanation, matching exactly this shape:
{ "grnNumber": string, "poNumber": string, "grnDate": string (ISO 8601), "items": [{ "itemCode": string, "description": string, "receivedQuantity": number }] }.
If a field is not visible, use null. Extract every line item, do not skip any.`,

  invoice: `You are extracting structured data from a vendor Invoice document image/PDF.
Return ONLY valid JSON, no markdown fences, no explanation, matching exactly this shape:
{ "invoiceNumber": string, "poNumber": string, "invoiceDate": string (ISO 8601), "items": [{ "itemCode": string, "description": string, "quantity": number, "unitRate": number, "mrp": number }] }.
If a field is not visible, use null. Extract every line item, do not skip any.`,
};

const REQUIRED_ITEM_FIELDS = {
  po: ["itemCode", "description", "quantity"],
  grn: ["itemCode", "description", "receivedQuantity"],
  invoice: ["itemCode", "description", "quantity"],
};

const REQUIRED_DOC_FIELDS = {
  po: ["poNumber", "poDate", "vendorName"],
  grn: ["grnNumber", "poNumber", "grnDate"],
  invoice: ["invoiceNumber", "poNumber", "invoiceDate"],
};

function stripCodeFences(text) {
  if (typeof text !== "string") return text;
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function guessMimeType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * Validates that the parsed JSON has the minimum required fields for the
 * given document type, and that `items` is a non-empty array whose entries
 * carry the minimum required item-level fields (values may be null, but the
 * keys must be present).
 */
function validateParsedShape(documentType, parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, reason: "Parsed output is not a JSON object" };
  }

  const docFields = REQUIRED_DOC_FIELDS[documentType];
  for (const field of docFields) {
    if (!(field in parsed)) {
      return { valid: false, reason: `Missing required field "${field}"` };
    }
  }

  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    return { valid: false, reason: "Missing or empty items[] array" };
  }

  const itemFields = REQUIRED_ITEM_FIELDS[documentType];
  for (const [idx, item] of parsed.items.entries()) {
    if (!item || typeof item !== "object") {
      return { valid: false, reason: `items[${idx}] is not an object` };
    }
    for (const field of itemFields) {
      if (!(field in item)) {
        return { valid: false, reason: `items[${idx}] missing required field "${field}"` };
      }
    }
  }

  return { valid: true };
}

async function callGemini(model, filePath, mimeType, promptText) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString("base64");

  const result = await model.generateContent([
    { inlineData: { data: base64Data, mimeType } },
    { text: promptText },
  ]);

  const response = result.response;
  return response.text();
}

/**
 * Extracts structured data for the given document type from the file at
 * filePath using Gemini. Retries once with a stricter prompt if the first
 * attempt fails to parse or fails shape validation. Returns
 * { success: true, data } or { success: false, error }.
 */
async function parseDocument(documentType, filePath) {
  if (!PROMPTS[documentType]) {
    return { success: false, error: `Unsupported documentType "${documentType}"` };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY is not configured on the server" };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const mimeType = guessMimeType(filePath);

  let lastRawText = null;
  let lastFailureReason = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let promptText = PROMPTS[documentType];

    if (attempt === 2) {
      promptText = `Your previous response was not valid JSON matching the required schema (reason: ${lastFailureReason}). This is attempt 2. Return ONLY valid, parseable JSON — no markdown code fences, no commentary, no trailing commas — matching exactly this schema:\n\n${PROMPTS[documentType]}`;
    }

    let rawText;
    try {
      rawText = await callGemini(model, filePath, mimeType, promptText);
    } catch (err) {
      lastFailureReason = `Gemini API call failed: ${err.message}`;
      lastRawText = null;
      continue;
    }

    lastRawText = rawText;
    const cleaned = stripCodeFences(rawText);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      lastFailureReason = "Response was not valid JSON";
      continue;
    }

    const validation = validateParsedShape(documentType, parsed);
    if (!validation.valid) {
      lastFailureReason = validation.reason;
      continue;
    }

    return { success: true, data: parsed, rawText };
  }

  return {
    success: false,
    error: `Failed to extract valid ${documentType.toUpperCase()} data after 2 attempts: ${lastFailureReason}`,
    rawText: lastRawText,
  };
}

module.exports = { parseDocument, stripCodeFences, validateParsedShape };
