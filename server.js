require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { verifyClaim } = require("./lib/verify");
const { extractWithLLM, extractFallback, generateSummary } = require("./lib/agent");
const { extractFromText } = require("./lib/parser");
const { computeScore, getScoreLabel } = require("./lib/score");
const { submitMessage, createTopic, closeClient } = require("./lib/hedera");
const { computeClaimHash } = require("./lib/hash");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const TOPIC_INFO_PATH = path.join(__dirname, "data/topic-info.json");

// ── Lire le topic-info ──
function getTopicInfo() {
  if (!fs.existsSync(TOPIC_INFO_PATH)) {
    throw new Error("data/topic-info.json introuvable. Lance d'abord : npm run seed");
  }
  return JSON.parse(fs.readFileSync(TOPIC_INFO_PATH, "utf8"));
}

// ── Parser le body d'une requête ──
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// ── Hash du texte CV ──
function hashCV(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ── Publier l'audit sur HCS ──
async function publishAudit(topicInfo, cvHash, results, score) {
  let auditTopicId = topicInfo.auditTopicId;

  // Créer le topic audit s'il n'existe pas encore
  if (!auditTopicId) {
    const newTopicId = await createTopic("TrustCV - agent-audit");
    auditTopicId = newTopicId.toString();
    topicInfo.auditTopicId = auditTopicId;
    fs.writeFileSync(TOPIC_INFO_PATH, JSON.stringify(topicInfo, null, 2));
  }

  const verified = results.filter((r) => r.status === "VÉRIFIÉ").length;
  const notFound = results.filter((r) => r.status === "INTROUVABLE").length;
  const revoked = results.filter((r) => r.status === "RÉVOQUÉ").length;

  const auditPayload = JSON.stringify({
    kind: "agent-audit",
    cvHash,
    verified,
    notFound,
    revoked,
    total: results.length,
    score,
    timestamp: new Date().toISOString(),
  });

  await submitMessage(auditTopicId, auditPayload);

  return {
    auditTopicId,
    hashscanUrl: `https://hashscan.io/testnet/topic/${auditTopicId}`,
  };
}

// ── Route POST /api/analyze ──
async function handleAnalyze(req, res) {
  try {
    const body = await parseBody(req);
    const { cvText, demoMode, demoFile } = body;
    console.log("[analyze] reçu — demoMode:", demoMode, "| cvText longueur:", cvText?.length ?? 0);

    if (!cvText && !demoMode) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "cvText ou demoMode requis" }));
      return;
    }

    const topicInfo = getTopicInfo();
    const { attestationsTopicId } = topicInfo;

    // 1. Extraction des affirmations
    let extracted;
    let extractionMode;

    if (demoMode) {
      // Mode démo explicite : on charge un CV de démonstration
      extracted = extractFallback(demoFile);
      extractionMode = "fallback";
      console.log("[analyze] mode: fallback (demoMode=true)");
    } else if (process.env.OPENAI_API_KEY) {
      // LLM disponible : meilleure extraction
      try {
        extracted = await extractWithLLM(cvText);
        extractionMode = "llm";
        console.log("[analyze] mode: llm, studentName:", extracted.studentName);
      } catch (err) {
        console.warn("[analyze] LLM indisponible, bascule sur le parseur déterministe:", err.message);
        extracted = extractFromText(cvText);
        extractionMode = "deterministic";
        console.log("[analyze] mode: deterministic (LLM fallback), studentName:", extracted.studentName);
      }
    } else {
      // Pas de LLM : parseur déterministe sur le vrai CV
      extracted = extractFromText(cvText);
      extractionMode = "deterministic";
      console.log("[analyze] mode: deterministic, studentName:", extracted.studentName);
    }

    const { studentName, claims } = extracted;

    // 2. Vérification déterministe de chaque affirmation
    const results = [];
    for (const claim of claims) {
      const result = await verifyClaim(claim, attestationsTopicId);
      results.push(result);
    }

    // 3. Score de confiance (calculé par le code)
    const score = computeScore(results);
    const scoreLabel = getScoreLabel(score);

    // 4. Résumé du profil (LLM ou template)
    const verifiedClaims = results.filter((r) => r.status === "VÉRIFIÉ");
    const summary = await generateSummary(studentName, verifiedClaims, results);

    // 5. Audit Hedera
    const cvHash = hashCV(cvText || JSON.stringify(claims));
    let audit = null;
    try {
      audit = await publishAudit(topicInfo, cvHash, results, score);
    } catch (err) {
      console.warn("Audit HCS indisponible:", err.message);
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        studentName,
        claims: results,
        score,
        scoreLabel,
        summary,
        audit,
        extractionMode,
        attestationsTopicId,
        attestationsHashscan: `https://hashscan.io/testnet/topic/${attestationsTopicId}`,
      })
    );
  } catch (err) {
    console.error("Erreur /api/analyze:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Route GET /api/demos ──
function handleDemos(res) {
  const demosDir = path.join(__dirname, "data/demo-cvs");
  const files = fs.readdirSync(demosDir).filter((f) => f.endsWith(".json"));
  const demos = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(demosDir, f), "utf8"));
    return { file: f, name: data.name, cvText: data.cvText };
  });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(demos));
}

// ── Serveur HTTP ──
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Routes API
  if (req.method === "POST" && req.url === "/api/analyze") {
    handleAnalyze(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/demos") {
    handleDemos(res);
    return;
  }

  // Servir les fichiers statiques (public/)
  let filePath = path.join(__dirname, "public", req.url === "/" ? "index.html" : req.url);

  // Sécurité : empêcher path traversal
  const publicDir = path.join(__dirname, "public");
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
  res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`\nTrustCV server running → http://localhost:${PORT}`);
  console.log(`Mode LLM : ${process.env.OPENAI_API_KEY ? "✅ OpenAI activé" : "🔄 Parseur déterministe (sans LLM)"}\n`);
});

process.on("SIGINT", () => {
  closeClient();
  server.close();
  process.exit(0);
});
