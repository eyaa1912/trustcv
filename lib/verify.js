/**
 * Vérification déterministe des affirmations CV
 *
 * Pour une affirmation {type, title, student, date, issuer} :
 *  1. Recalcule le SHA-256 canonique (même algo que seed.js)
 *  2. Lit tous les messages du topic HCS via le mirror node
 *  3. Cherche le hash dans les attestations
 *  4. Vérifie s'il existe un message de révocation
 *  5. Retourne VÉRIFIÉ | INTROUVABLE | RÉVOQUÉ + métadonnées
 */

const { getTopicMessages, parseMessage, MIRROR_NODE_URL } = require("./hedera");
const { computeClaimHash } = require("./hash");

const STATUS = {
  VERIFIED: "VÉRIFIÉ",
  NOT_FOUND: "INTROUVABLE",
  REVOKED: "RÉVOQUÉ",
};

/**
 * Vérifie une affirmation contre le topic HCS.
 * @param {object} claim  - { type, title, student, date, issuer }
 * @param {string} topicId - ID du topic HCS des attestations
 * @returns {object} résultat de vérification
 */
async function verifyClaim(claim, topicId) {
  const hash = computeClaimHash(claim);

  // Lire tous les messages du topic
  let messages;
  try {
    messages = await getTopicMessages(topicId);
  } catch (err) {
    return {
      status: STATUS.NOT_FOUND,
      hash,
      error: `Mirror node inaccessible : ${err.message}`,
      hashscanUrl: null,
      timestamp: null,
    };
  }

  // Séparer attestations et révocations
  const attestations = [];
  const revocations = new Set();

  for (const msg of messages) {
    const parsed = parseMessage(msg);
    if (!parsed) continue;

    if (parsed.kind === "attestation") {
      attestations.push({ ...parsed, consensusTimestamp: msg.consensus_timestamp });
    } else if (parsed.kind === "revocation") {
      revocations.add(parsed.attestationId);
    }
  }

  // Chercher le hash dans les attestations
  const found = attestations.find((a) => a.hash === hash);

  if (!found) {
    return {
      status: STATUS.NOT_FOUND,
      hash,
      hashscanUrl: null,
      timestamp: null,
      claim,
    };
  }

  // Vérifier la révocation
  if (revocations.has(found.id)) {
    return {
      status: STATUS.REVOKED,
      hash,
      attestationId: found.id,
      issuer: found.issuer,
      hashscanUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      timestamp: found.consensusTimestamp,
      claim,
    };
  }

  return {
    status: STATUS.VERIFIED,
    hash,
    attestationId: found.id,
    issuer: found.issuer,
    hashscanUrl: `https://hashscan.io/testnet/topic/${topicId}`,
    timestamp: found.consensusTimestamp,
    claim,
  };
}

module.exports = { verifyClaim, STATUS };
