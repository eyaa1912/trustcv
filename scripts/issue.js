/**
 * TrustCV — Issue an attestation for any student
 *
 * Usage:
 *   node scripts/issue.js --type diploma --title "Licence Informatique" \
 *     --student "Ranim Hamadi" --date 2024-06-01 --issuer "ESPRIT"
 *
 * Or interactive (no arguments):
 *   node scripts/issue.js
 *
 * This publishes a hash on Hedera HCS. No personal data is stored on-chain.
 */

console.clear();
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");
const { submitMessage } = require("../lib/hedera");
const { computeClaimHash } = require("../lib/hash");

const TOPIC_INFO_PATH = path.join(__dirname, "../data/topic-info.json");

// ── Parse CLI args ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      result[args[i].slice(2)] = args[i + 1] || "";
      i++;
    }
  }
  return result;
}

// ── Interactive prompt ──────────────────────────────────────────────────────
function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function askInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("TrustCV — Émettre une attestation");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const types = ["diploma", "internship", "certification", "hackathon", "volunteer"];
  console.log("Types disponibles : " + types.join(", "));

  const type    = await prompt(rl, "Type          : ");
  const title   = await prompt(rl, "Titre         : ");
  const student = await prompt(rl, "Nom étudiant  : ");
  const date    = await prompt(rl, "Date (YYYY-MM-DD) : ");
  const issuer  = await prompt(rl, "Émetteur      : ");

  rl.close();
  return { type, title, student, date, issuer };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Charger le topic ID
  if (!fs.existsSync(TOPIC_INFO_PATH)) {
    console.error("✗ data/topic-info.json introuvable. Lance d'abord : npm run seed");
    process.exit(1);
  }

  const { attestationsTopicId } = JSON.parse(fs.readFileSync(TOPIC_INFO_PATH, "utf8"));

  // Récupérer les données depuis les args ou en mode interactif
  const args = parseArgs();
  let claim;

  if (args.type && args.title && args.student && args.date && args.issuer) {
    claim = {
      type:    args.type.trim(),
      title:   args.title.trim(),
      student: args.student.trim(),
      date:    args.date.trim(),
      issuer:  args.issuer.trim(),
    };
  } else {
    claim = await askInteractive();
  }

  // Validation basique
  if (!claim.type || !claim.title || !claim.student || !claim.date || !claim.issuer) {
    console.error("\n✗ Tous les champs sont requis (type, title, student, date, issuer)");
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(claim.date)) {
    console.error("\n✗ La date doit être au format YYYY-MM-DD (ex: 2024-06-01)");
    process.exit(1);
  }

  // Calculer le hash
  const hash = computeClaimHash(claim);

  // Générer un ID unique
  const id = `att-${Date.now()}`;

  // Construire le payload HCS
  const payload = JSON.stringify({
    kind:    "attestation",
    id,
    hash,
    category: claim.type,
    issuer:   claim.issuer,
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Attestation à publier");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Étudiant : ${claim.student}`);
  console.log(`  Type     : ${claim.type}`);
  console.log(`  Titre    : ${claim.title}`);
  console.log(`  Émetteur : ${claim.issuer}`);
  console.log(`  Date     : ${claim.date}`);
  console.log(`  Hash     : ${hash.substring(0, 32)}…`);
  console.log(`  Topic    : ${attestationsTopicId}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("Publication sur Hedera HCS...");
  const result = await submitMessage(attestationsTopicId, payload);

  console.log(`\n✓ Attestation publiée !`);
  console.log(`  Transaction : ${result.transactionId}`);
  console.log(`  Status      : ${result.status}`);
  console.log(`  HashScan    : https://hashscan.io/testnet/topic/${attestationsTopicId}`);
  console.log("\nLe recruteur peut maintenant vérifier ce CV sur TrustCV.\n");
}

main().catch((err) => {
  console.error("\n✗ Erreur :", err.message);
  process.exitCode = 1;
});
