console.clear();

const path = require("path");
const fs = require("fs");
const {
  createTopic,
  submitMessage,
  closeClient,
} = require("../lib/hedera");
const { computeClaimHash } = require("../lib/hash");

const DATA_PATH = path.join(__dirname, "..", "data", "attestations.json");
const TOPIC_INFO_PATH = path.join(__dirname, "..", "data", "topic-info.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ── Charger les données d'attestations ──
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const { attestations, revoked } = data;

  console.log("TrustCV — Seed des attestations sur Hedera");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 1. Créer le topic
  console.log('1/ Création du topic HCS "TrustCV — attestations" ...');
  const topicId = await createTopic("TrustCV - attestations");
  console.log(`   ✓ Topic créé : ${topicId.toString()}\n`);

  // 2. Publier les attestations
  console.log(`2/ Publication de ${attestations.length} attestations ...`);
  for (const att of attestations) {
    const hash = computeClaimHash(att);

    const payload = JSON.stringify({
      kind: "attestation",
      id: att.id,
      hash: hash,
      category: att.type,
      issuer: att.issuer,
    });

    await submitMessage(topicId, payload);

    const flag = revoked.includes(att.id) ? " [sera révoquée]" : "";
    console.log(
      `   ✓ ${att.id} | ${att.type.padEnd(13)} | ${att.issuer.padEnd(20)} | ${hash.substring(0, 16)}…${flag}`,
    );

    await sleep(1500);
  }

  // 3. Publier les révocations
  console.log(`\n3/ Publication de ${revoked.length} révocation(s) ...`);
  for (const attId of revoked) {
    const att = attestations.find((a) => a.id === attId);

    const payload = JSON.stringify({
      kind: "revocation",
      attestationId: attId,
      reason: "Certification expirée",
    });

    await submitMessage(topicId, payload);
    console.log(`   ✗ ${attId} | ${att.title} | révoquée`);
    await sleep(1500);
  }

  // 4. Attendre l'indexation du mirror node
  console.log("\n4/ Attente de l'indexation du mirror node (5s) ...");
  await sleep(5000);

  // 5. Sauvegarder le topic-info
  const topicInfo = {
    attestationsTopicId: topicId.toString(),
    auditTopicId: null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(TOPIC_INFO_PATH, JSON.stringify(topicInfo, null, 2));

  // 6. Résumé
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SEED TERMINÉ");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(`Topic attestations : ${topicId.toString()}`);
  console.log(
    `HashScan           : https://hashscan.io/testnet/topic/${topicId.toString()}`,
  );
  console.log(`\nTopic info sauvegardé : data/topic-info.json`);
  console.log(
    `\n${attestations.length} attestations publiées + ${revoked.length} révocation(s)`,
  );
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((err) => {
    console.error("\n✗ Erreur :", err.message);
    process.exitCode = 1;
  })
  .finally(() => closeClient());
