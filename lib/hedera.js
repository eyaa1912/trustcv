require("dotenv").config();

const {
  Client,
  AccountId,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} = require("@hiero-ledger/sdk");

const MIRROR_NODE_URL = "https://testnet.mirrornode.hedera.com";

let _client = null;

/**
 * Parse une clé privée peu importe le format :
 *   - HEX brut 0x...  → ECDSA
 *   - HEX brut 64 chars → ECDSA
 *   - DER ECDSA 3030... → fromStringDer
 *   - DER ED25519 302e... → fromStringDer
 *   - Fallback : essaie tous les parseurs
 */
function parsePrivateKey(keyString) {
  const k = keyString.trim();

  // HEX brut avec préfixe 0x
  if (k.startsWith("0x")) {
    return PrivateKey.fromStringECDSA(k);
  }

  // HEX brut 64 caractères (sans préfixe)
  if (/^[0-9a-fA-F]{64}$/.test(k)) {
    return PrivateKey.fromStringECDSA(k);
  }

  // DER ECDSA (3030...) ou ED25519 (302e...)
  // On essaie fromStringDer d'abord, puis les parseurs spécifiques
  const parsers = [
    () => PrivateKey.fromStringDer(k),
    () => PrivateKey.fromStringECDSA(k),
    () => PrivateKey.fromString(k),
  ];

  for (const parse of parsers) {
    try {
      return parse();
    } catch {
      // essaye le suivant
    }
  }

  throw new Error(`Impossible de parser la clé privée. Vérifie MY_PRIVATE_KEY dans .env`);
}

function getClient() {
  if (_client) return _client;

  const operatorId = process.env.MY_ACCOUNT_ID;
  const operatorKey = process.env.MY_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "MY_ACCOUNT_ID et MY_PRIVATE_KEY doivent être définis dans .env",
    );
  }

  _client = Client.forTestnet();
  _client.setOperator(
    AccountId.fromString(operatorId),
    parsePrivateKey(operatorKey),
  );
  return _client;
}

function getOperatorPublicKey() {
  return parsePrivateKey(process.env.MY_PRIVATE_KEY).publicKey;
}

// ── Créer un topic HCS ──
async function createTopic(memo) {
  const client = getClient();
  const pubKey = getOperatorPublicKey();

  const tx = new TopicCreateTransaction()
    .setAdminKey(pubKey)
    .setSubmitKey(pubKey);

  if (memo) {
    try {
      tx.setTopicMemo(memo);
    } catch {
      // setTopicMemo peut ne pas exister selon la version du SDK
    }
  }

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return receipt.topicId;
}

// ── Publier un message sur un topic HCS ──
async function submitMessage(topicId, message) {
  const client = getClient();

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .execute(client);

  const receipt = await tx.getReceipt(client);

  return {
    status: receipt.status.toString(),
    transactionId: tx.transactionId.toString(),
  };
}

// ── Lire tous les messages d'un topic via le mirror node ──
async function getTopicMessages(topicId) {
  let allMessages = [];
  let url = `${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?limit=100`;

  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mirror Node error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    allMessages = allMessages.concat(data.messages || []);
    url = data.links?.next
      ? `${MIRROR_NODE_URL}${data.links.next}`
      : null;
  }

  return allMessages;
}

// ── Décoder un message base64 → JSON ──
function parseMessage(msg) {
  try {
    const content = Buffer.from(msg.message, "base64").toString("utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function closeClient() {
  if (_client) {
    _client.close();
    _client = null;
  }
}

module.exports = {
  getClient,
  createTopic,
  submitMessage,
  getTopicMessages,
  parseMessage,
  closeClient,
  MIRROR_NODE_URL,
};
