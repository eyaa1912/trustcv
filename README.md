# TrustCV

> **Un CV n'est plus une promesse, c'est une preuve.**

TrustCV permet à un recruteur de savoir en quelques secondes si ce qu'il y a dans un CV est vrai — sans appeler l'école, sans faire confiance sur parole.

Projet réalisé dans le cadre du **Hedera Cross Campus Hackathon 2026**.

---

## Le problème

- Les CV sont faciles à falsifier (faux diplômes, faux stages).
- Les vérifier à la main est long, coûteux, et rarement fait.
- Les étudiants honnêtes ne peuvent pas prouver facilement ce qu'ils ont accompli.

## Ce que TrustCV apporte

| Qui | Ce qu'il obtient |
|---|---|
| **Recruteur** | Résultat clair (Vérifié / Introuvable / Révoqué) + score de confiance |
| **Étudiant** | Ses diplômes et certifications sont prouvables partout |
| **École / Entreprise** | Ses attestations ne peuvent plus être copiées ou falsifiées |

---

## Comment ça marche

```
École/Entreprise  →  publie l'attestation (hash SHA-256) sur Hedera HCS
Candidat          →  donne son CV au recruteur
Recruteur         →  colle le CV dans TrustCV → résultat instantané
```

1. L'IA extrait les affirmations du CV (diplômes, stages, certifications)
2. Chaque affirmation est hashée en SHA-256 (déterministe)
3. Le hash est comparé aux attestations ancrées sur **Hedera Consensus Service**
4. Le résultat est : **Vérifié** / **Introuvable** / **Révoqué**
5. L'analyse elle-même est publiée sur un topic d'audit HCS (traçabilité complète)

**Aucune donnée personnelle n'est stockée on-chain** — uniquement des hash.

---

## Stack technique

- **Hedera HCS** — stockage immuable des attestations (hash)
- **Mirror Node** — lecture des messages du topic sans coût
- **SHA-256** — hash déterministe de chaque affirmation
- **OpenAI GPT-4o-mini** — extraction des affirmations (optionnel)
- **Parseur déterministe** — extraction sans LLM si pas de clé API
- **Node.js** — serveur HTTP léger, zéro framework

---

## Installation

```bash
cd trustcv
npm install
```

Copier le fichier d'environnement et remplir les credentials Hedera :

```bash
cp .env.example .env
```

```env
MY_ACCOUNT_ID=0.0.xxxxxx
MY_PRIVATE_KEY=302e...
OPENAI_API_KEY=sk-...   # optionnel
```

---

## Démarrage rapide

### 1. Seeder les attestations sur Hedera

```bash
npm run seed
```

Publie les attestations de démonstration sur un nouveau topic HCS.
Crée automatiquement `data/topic-info.json` avec l'ID du topic.

### 2. Lancer le serveur

```bash
npm start
```

Ouvre [http://localhost:3000](http://localhost:3000)

### 3. Émettre une attestation pour un étudiant

```bash
# Mode ligne de commande
node scripts/issue.js \
  --type diploma \
  --title "Licence Informatique" \
  --student "Ranim Hamadi" \
  --date 2024-06-01 \
  --issuer "ESPRIT"

# Mode interactif
npm run issue
```

Types disponibles : `diploma`, `internship`, `certification`, `hackathon`, `volunteer`

### 4. Vérifier les attestations (tests unitaires)

```bash
npm run test-verify
```

---

## Structure du projet

```
trustcv/
├── server.js                  # Serveur HTTP (API + fichiers statiques)
├── public/
│   └── index.html             # Interface recruteur
├── lib/
│   ├── agent.js               # Extraction IA (OpenAI ou template)
│   ├── parser.js              # Parseur déterministe (FR + EN)
│   ├── verify.js              # Vérification sur Hedera HCS
│   ├── hash.js                # Hash SHA-256 déterministe
│   ├── hedera.js              # Client Hedera + Mirror Node
│   └── score.js               # Calcul du score de confiance
├── scripts/
│   ├── seed.js                # Seeder les attestations de démo
│   ├── issue.js               # Émettre une attestation (école/entreprise)
│   └── test-verify.js         # Tests de vérification
└── data/
    ├── attestations.json      # Données de démonstration
    ├── demo-cvs/              # CV de démo (honnête, faux, révoqué)
    └── topic-info.json        # IDs des topics HCS (généré par seed)
```

---

## API

### `POST /api/analyze`

Analyse un CV et retourne les résultats de vérification.

```json
{ "cvText": "texte du CV..." }
```

**Réponse :**

```json
{
  "studentName": "Prénom Nom",
  "claims": [
    {
      "status": "VÉRIFIÉ",
      "claim": { "type": "diploma", "title": "...", "issuer": "...", "date": "..." },
      "hashscanUrl": "https://hashscan.io/testnet/topic/..."
    }
  ],
  "score": 85,
  "scoreLabel": { "label": "Excellent", "color": "#22c55e" },
  "summary": "Résumé du profil...",
  "audit": { "auditTopicId": "0.0.xxxxx", "hashscanUrl": "..." }
}
```

### `GET /api/demos`

Retourne la liste des CV de démonstration disponibles.

---

## Vérification on-chain

Chaque attestation publiée sur Hedera est visible publiquement sur HashScan :

- **Topic attestations** : `https://hashscan.io/testnet/topic/<attestationsTopicId>`
- **Topic audit** : `https://hashscan.io/testnet/topic/<auditTopicId>`

---

## Auteurs

Projet développé à ESPRIT pour le Hedera Cross Campus Hackathon 2026.
