/**
 * Agent IA TrustCV
 *
 * Mode LLM  : appelle OpenAI pour extraire les affirmations du CV (JSON strict)
 * Mode secours : charge un JSON de démo si pas de clé API
 *
 * Le LLM ne décide JAMAIS du statut — il extrait seulement les affirmations.
 * La vérification est faite par verify.js (code déterministe).
 */

const fs = require("fs");
const path = require("path");

// Schéma JSON strict qu'on attend du LLM
const CLAIM_SCHEMA = {
  type: "string (diploma|internship|certification|hackathon|volunteer|other)",
  title: "string",
  student: "string",
  date: "YYYY-MM-DD",
  issuer: "string",
};

const SYSTEM_PROMPT = `Tu es un extracteur de données CV. 
Extrait toutes les affirmations vérifiables du CV fourni.
Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication.
Format exact :
{
  "studentName": "Prénom Nom",
  "claims": [
    {
      "type": "diploma|internship|certification|hackathon|volunteer|other",
      "title": "titre exact",
      "student": "Prénom Nom",
      "date": "YYYY-MM-DD",
      "issuer": "nom de l'organisation émettrice"
    }
  ]
}
Si une date est approximative (ex: "2023"), utilise "YYYY-01-01".
Inclus uniquement les affirmations qui ont un titre, un émetteur et une date.`;

/**
 * Extraction via OpenAI
 */
async function extractWithLLM(cvText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Pas de clé OpenAI");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `CV :\n${cvText}` },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Réponse OpenAI vide");

  return JSON.parse(content);
}

/**
 * Mode secours — retourne les données du CV de démo
 */
function extractFallback(cvDemoName) {
  const demosDir = path.join(__dirname, "../data/demo-cvs");
  const files = fs.readdirSync(demosDir).filter((f) => f.endsWith(".json"));

  // Cherche le fichier demandé, sinon prend le premier
  const target = cvDemoName
    ? files.find((f) => f.includes(cvDemoName)) || files[0]
    : files[0];

  const demo = JSON.parse(fs.readFileSync(path.join(demosDir, target), "utf8"));
  return { studentName: demo.studentName, claims: demo.claims, demoFile: target };
}

/**
 * Génère le résumé de profil (5 lignes) — le LLM rédige, mais
 * seulement à partir des affirmations vérifiées passées en paramètre.
 * Si pas de clé API → résumé généré par template code.
 */
async function generateSummary(studentName, verifiedClaims, allResults) {
  const apiKey = process.env.OPENAI_API_KEY;

  const verifiedList = verifiedClaims
    .map((r) => `- ${r.claim.type} : "${r.claim.title}" (${r.claim.issuer}, ${r.claim.date})`)
    .join("\n");

  const notVerifiedCount = allResults.filter(
    (r) => r.status !== "VÉRIFIÉ"
  ).length;

  if (!apiKey) {
    // Résumé template par code
    return generateTemplateSummary(studentName, verifiedClaims, notVerifiedCount);
  }

  const prompt = `Rédige un résumé professionnel de 5 lignes pour ${studentName}.
Ne mentionne QUE les éléments suivants (vérifiés sur blockchain) :
${verifiedList || "Aucune affirmation vérifiée."}
${notVerifiedCount > 0 ? `Signale en dernière ligne que ${notVerifiedCount} affirmation(s) n'ont pas pu être vérifiées.` : ""}
Sois factuel, concis, professionnel. Pas de mise en forme markdown.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) return generateTemplateSummary(studentName, verifiedClaims, notVerifiedCount);

  const data = await response.json();
  return data.choices?.[0]?.message?.content || generateTemplateSummary(studentName, verifiedClaims, notVerifiedCount);
}

function generateTemplateSummary(studentName, verifiedClaims, notVerifiedCount) {
  const diplomas = verifiedClaims.filter((r) => r.claim.type === "diploma");
  const internships = verifiedClaims.filter((r) => r.claim.type === "internship");
  const certs = verifiedClaims.filter((r) => r.claim.type === "certification");
  const hackathons = verifiedClaims.filter((r) => r.claim.type === "hackathon");

  const lines = [];
  lines.push(`${studentName} est un(e) professionnel(le) dont le profil a été vérifié sur la blockchain Hedera.`);

  if (diplomas.length > 0)
    lines.push(`Formation : ${diplomas.map((r) => `${r.claim.title} (${r.claim.issuer})`).join(", ")}.`);

  if (internships.length > 0)
    lines.push(`Expérience : ${internships.map((r) => `${r.claim.title} chez ${r.claim.issuer}`).join(", ")}.`);

  if (certs.length > 0)
    lines.push(`Certifications vérifiées : ${certs.map((r) => `${r.claim.title}`).join(", ")}.`);

  if (hackathons.length > 0)
    lines.push(`Distinctions : ${hackathons.map((r) => r.claim.title).join(", ")}.`);

  if (lines.length < 5)
    lines.push(`Score de confiance calculé sur ${verifiedClaims.length} affirmation(s) vérifiée(s) sur la blockchain.`);

  if (notVerifiedCount > 0)
    lines.push(`⚠ ${notVerifiedCount} affirmation(s) n'ont pas pu être vérifiées sur Hedera.`);

  return lines.slice(0, 6).join("\n");
}

module.exports = { extractWithLLM, extractFallback, generateSummary };
