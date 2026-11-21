const crypto = require("crypto");

/**
 * Construit la chaîne canonique d'une affirmation.
 * Ordre fixe : type|title|student|date|issuer
 * Tout est lowercased + trimmed pour garantir le déterminisme.
 */
function canonicalClaim(claim) {
  return [
    claim.type,
    claim.title,
    claim.student,
    claim.date,
    claim.issuer,
  ]
    .map((s) => String(s ?? "").toLowerCase().trim())
    .join("|");
}

/**
 * Calcule le SHA-256 d'une affirmation.
 * Ce hash est ce qui est publié sur HCS et ce que la vérification recalcule.
 */
function computeClaimHash(claim) {
  return crypto
    .createHash("sha256")
    .update(canonicalClaim(claim))
    .digest("hex");
}

module.exports = { canonicalClaim, computeClaimHash };
