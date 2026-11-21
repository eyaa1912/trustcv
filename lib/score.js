/**
 * Score de confiance — calculé par le CODE, jamais par le LLM
 *
 * Formule :
 *   score = (vérifié × 1.0 + révoqué × 0.0 + introuvable × 0.0) / total × 100
 *   Bonus +5 si au moins 1 diplôme vérifié
 *   Pénalité -10 si au moins 1 attestation révoquée
 *
 * Retourne un entier entre 0 et 100.
 */

const { STATUS } = require("./verify");

function computeScore(results) {
  if (!results || results.length === 0) return 0;

  const total = results.length;
  const verified = results.filter((r) => r.status === STATUS.VERIFIED).length;
  const revoked = results.filter((r) => r.status === STATUS.REVOKED).length;

  let score = Math.round((verified / total) * 100);

  // Bonus diplôme vérifié
  const hasDiploma = results.some(
    (r) => r.status === STATUS.VERIFIED && r.claim?.type === "diploma"
  );
  if (hasDiploma) score = Math.min(100, score + 5);

  // Pénalité révocation
  if (revoked > 0) score = Math.max(0, score - 10);

  return score;
}

function getScoreLabel(score) {
  if (score >= 80) return { label: "Excellent", color: "#22c55e" };
  if (score >= 60) return { label: "Bon", color: "#3b82f6" };
  if (score >= 40) return { label: "Moyen", color: "#f59e0b" };
  return { label: "Faible", color: "#ef4444" };
}

module.exports = { computeScore, getScoreLabel };
