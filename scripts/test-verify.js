/**
 * Test de la vérification déterministe — sans LLM
 * Teste les 6 attestations seedées : 5 doivent être VÉRIFIÉ, 1 RÉVOQUÉ
 * Teste aussi 1 affirmation inventée : doit être INTROUVABLE
 */

console.clear();
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const { verifyClaim, STATUS } = require("../lib/verify");

const TOPIC_INFO_PATH = path.join(__dirname, "../data/topic-info.json");
const ATTESTATIONS_PATH = path.join(__dirname, "../data/attestations.json");

const BADGE = {
  [STATUS.VERIFIED]: "✅ VÉRIFIÉ    ",
  [STATUS.NOT_FOUND]: "❓ INTROUVABLE",
  [STATUS.REVOKED]: "🚫 RÉVOQUÉ    ",
};

async function main() {
  // Charger le topic ID
  if (!fs.existsSync(TOPIC_INFO_PATH)) {
    console.error("✗ data/topic-info.json introuvable. Lance d'abord : npm run seed");
    process.exit(1);
  }
  const { attestationsTopicId } = JSON.parse(fs.readFileSync(TOPIC_INFO_PATH, "utf8"));
  const { attestations, revoked } = JSON.parse(fs.readFileSync(ATTESTATIONS_PATH, "utf8"));

  console.log("TrustCV — Test de vérification déterministe");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Topic : ${attestationsTopicId}`);
  console.log(`HashScan : https://hashscan.io/testnet/topic/${attestationsTopicId}\n`);

  let passed = 0;
  let failed = 0;

  // ── Test 1 : les 6 attestations seedées ──
  console.log("── Test 1 : attestations seedées ─────────────────────────────");
  for (const att of attestations) {
    const result = await verifyClaim(att, attestationsTopicId);
    const expected = revoked.includes(att.id) ? STATUS.REVOKED : STATUS.VERIFIED;
    const ok = result.status === expected;

    console.log(
      `${ok ? "✓" : "✗"} ${BADGE[result.status]} | ${att.id} | ${att.title.substring(0, 35).padEnd(35)} | ${att.issuer}`
    );

    if (!ok) {
      console.log(`   ATTENDU : ${expected}, OBTENU : ${result.status}`);
      failed++;
    } else {
      passed++;
    }
  }

  // ── Test 2 : affirmation inventée (doit être INTROUVABLE) ──
  console.log("\n── Test 2 : affirmation inventée ──────────────────────────────");
  const fakeClaim = {
    type: "diploma",
    title: "Faux Diplôme Inventé",
    student: "Candidat Inconnu",
    date: "2020-01-01",
    issuer: "Université Fantôme",
  };

  const fakeResult = await verifyClaim(fakeClaim, attestationsTopicId);
  const fakeOk = fakeResult.status === STATUS.NOT_FOUND;
  console.log(
    `${fakeOk ? "✓" : "✗"} ${BADGE[fakeResult.status]} | Faux Diplôme Inventé | Université Fantôme`
  );
  fakeOk ? passed++ : failed++;

  // ── Résumé ──
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const total = passed + failed;
  console.log(`Résultat : ${passed}/${total} tests passés`);
  if (failed === 0) {
    console.log("✅ Tous les tests sont passés — vérification déterministe OK");
  } else {
    console.log(`✗ ${failed} test(s) échoué(s)`);
    process.exitCode = 1;
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("\n✗ Erreur fatale :", err.message);
  process.exitCode = 1;
});
