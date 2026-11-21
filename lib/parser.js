/**
 * Parseur déterministe de CV — extrait les affirmations du texte sans LLM
 * Supporte les formats français ET anglais
 */

const MONTHS = {
  'janv': '01', 'janvier': '01',
  'févr': '02', 'fevr': '02', 'février': '02', 'fevrier': '02',
  'mars': '03',
  'avr': '04', 'avril': '04',
  'mai': '05',
  'juin': '06',
  'juil': '07', 'juillet': '07',
  'août': '08', 'aout': '08',
  'sept': '09', 'septembre': '09',
  'oct': '10', 'octobre': '10',
  'nov': '11', 'novembre': '11',
  'déc': '12', 'dec': '12', 'décembre': '12', 'decembre': '12',
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12',
};

const SECTION_MAP = [
  { pattern: /^(FORMATION|EDUCATION|ACADEMIC|DIPLÔME|DIPLOME|DEGREE)/i,                        type: 'diploma' },
  { pattern: /^(EXPÉRIENCE|EXPERIENCE|WORK\s*EXPERIENCE|PROFESSIONAL\s*EXPERIENCE|STAGE|INTERNSHIP|EMPLOI|EMPLOYMENT)/i, type: 'internship' },
  { pattern: /^(CERTIFICATION|LICENSES?\s*&?\s*CERTIFICATIONS?)/i,                              type: 'certification' },
  { pattern: /^(HACKATHON|DISTINCTION|PRIX|AWARD|ACHIEVEMENT)/i,                                type: 'hackathon' },
  { pattern: /^(BÉNÉVOLAT|VOLONTERIAT|VOLUNTEER|ASSOCIATIF)/i,                                  type: 'volunteer' },
];

const SKIP_PATTERN = /^(PROFIL|COMPÉTENCE|SKILL|LANGUE|LANGUAGE|OUTIL|TOOL|QUALITÉ|CENTRE|CONTACT|COORDONN|RÉFÉRENCE|REFERENCE|LOISIR|INTÉRÊT|INTEREST|OBJECTIF|RÉSUMÉ|RESUME|ABOUT|SUMMARY|HOBBIES?|PUBLICATION|PROJECT|PROJET|TECHNICAL|TECHNOLOGY|TECHNOLOGIES)/i;

const COMMON_TITLE_WORDS = [
  'Étudiant','Étudiante','Ingénieur','Ingénieure','Développeur','Développeuse',
  'Chef','Directeur','Directrice','Manager','Consultant','Architecte',
  'Designer','Technicien','Stagiaire','Professeur','Docteur','Doctorant',
  'Doctorante','Chercheur','Élève','Apprenti','Curriculum','Resume',
  'Student','Engineer','Developer','Intern','Analyst','Specialist',
  'Coordinator','Assistant','Administrator','Architect','Passionné',
  'Passionnée','Motivé','Motivée','Dynamique','Ponctuelle','Souriante',
  'Software','Senior','Junior','Lead','Bachelor','Master','Doctor',
];

// ── Normalisation de date ──────────────────────────────────────────────────

function normalizeDate(str) {
  if (!str) return null;
  str = str.trim().replace(/\s+/g, ' ');

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}$/.test(str)) return str + '-01-01';

  // "Month YYYY" or "Mon. YYYY"
  const m1 = str.match(/^([a-zàâäéèêëïîôöùûüç]+)\.?\s+(\d{4})$/i);
  if (m1) {
    const month = MONTHS[m1[1].toLowerCase().replace(/\.$/, '')];
    if (month) return `${m1[2]}-${month}-01`;
  }

  // "MM/YYYY" or "MM/DD/YYYY"
  const m2 = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1].padStart(2,'0')}-01`;

  const m3 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`;

  return null;
}

/**
 * Tente d'extraire une date depuis le début d'une chaîne.
 * Supporte : "2026", "juil. 2026", "July 2026", "Jan 2023"
 */
function tryExtractDate(str) {
  str = str.trim();

  // "Month YYYY"
  const m1 = str.match(/^([a-zàâäéèêëïîôöùûüç]+)\.?\s+(\d{4})/i);
  if (m1) {
    const month = MONTHS[m1[1].toLowerCase().replace(/\.$/, '')];
    if (month) return { date: `${m1[2]}-${month}-01`, rest: str.substring(m1[0].length).trim() };
  }

  // "YYYY"
  if (/^\d{4}\b/.test(str)) {
    const m = str.match(/^(\d{4})/);
    return { date: m[1] + '-01-01', rest: str.substring(4).trim() };
  }

  return null;
}

/**
 * Cherche une date n'importe où dans une chaîne.
 * Utile pour les formats anglais "Company   Jan 2023 – Dec 2023"
 */
function findDateAnywhere(str) {
  // "Month YYYY" anywhere
  const m1 = str.match(/([a-z]+\.?\s+\d{4})/i);
  if (m1) {
    const d = normalizeDate(m1[1]);
    if (d) return d;
  }
  // "YYYY" anywhere
  const m2 = str.match(/\b(\d{4})\b/);
  if (m2) return m2[1] + '-01-01';
  return null;
}

// ── Prétraitement ──────────────────────────────────────────────────────────

function preprocessCvText(text) {
  const newlineCount = (text.match(/\n/g) || []).length;
  if (newlineCount >= 5) return text;

  text = text.replace(
    /([a-z0-9à-ÿ.])(FORMATION|EDUCATION|ACADEMIC|DIPLÔME|DIPLOME|EXPÉRIENCES?|EXPERIENCES?|WORK\s*EXPERIENCE|STAGES?|CERTIFICATIONS?|COMPÉTENCES?|COMPETENCES?|SKILLS?|LANGUES?|LANGUAGES?|OUTILS?|QUALITÉS?|CENTRES?|PROFIL|CONTACT|COORDONNÉES?|RÉFÉRENCES?|LOISIRS?|INTÉRÊTS?|INTERESTS?|SUMMARY|ABOUT)/gi,
    '$1\n$2'
  );
  text = text.replace(
    /(FORMATION|EDUCATION|ACADEMIC|DIPLÔMES?|DIPLOMES?|EXPÉRIENCES?|EXPERIENCES?|WORK\s*EXPERIENCE|STAGES?|CERTIFICATIONS?|COMPÉTENCES?|COMPETENCES?|SKILLS?|LANGUES?|PROFIL|CONTACT|RÉFÉRENCES?|RÉSUMÉ|RESUME|SUMMARY|ABOUT)(\d|[A-ZÀ-Ý])/gi,
    '$1\n$2'
  );
  text = text.replace(/([a-zà-ÿ])(\d{4}\s*[–\-—])/g, '$1\n$2');
  text = text.replace(/(\d{4})([A-ZÀ-Ý])/g, '$1\n$2');

  return text;
}

// ── Extraction du nom ──────────────────────────────────────────────────────

function extractStudentName(lines) {
  for (const line of lines.slice(0, 8)) {
    if (!line || line.length < 3) continue;

    let cleaned = line
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/\S+@\S+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\b[\d\+\(\)\/\-]{6,}\b/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned || cleaned.length < 3) continue;
    if (SKIP_PATTERN.test(cleaned)) continue;
    if (SECTION_MAP.some(s => s.pattern.test(cleaned))) continue;

    // Supprimer ce qui vient après un tiret/pipe (titre de poste)
    cleaned = cleaned.split(/\s*[|–—]\s*/)[0].trim();

    const words = cleaned.split(/\s+/);
    if (words.length < 2) continue;

    const nameWords = [];
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-ZàâäéèêëïîôöùûüçÀ-ÿ\-]/g, '');
      if (!cleanWord || cleanWord.length < 2) break;
      if (!/^[A-ZÀ-Ý]/.test(cleanWord)) break;
      if (COMMON_TITLE_WORDS.some(tw => cleanWord.toLowerCase() === tw.toLowerCase())) break;
      nameWords.push(cleanWord);
    }

    if (nameWords.length >= 2) return nameWords.slice(0, 4).join(' ');
  }

  // Fallback : première ligne avec au moins deux mots en majuscule
  for (const line of lines.slice(0, 5)) {
    if (!line) continue;
    const cleaned = line.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/\S+@\S+/g, '').trim();
    const words = cleaned.split(/\s+/).slice(0, 3);
    if (words.length >= 2 && /^[A-ZÀ-Ý]/.test(words[0])) return words.join(' ');
  }

  return 'Candidat inconnu';
}

// ── Identification des sections ────────────────────────────────────────────

function identifySections(lines) {
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    if (!line) continue;

    const matchedSection = SECTION_MAP.find(s => s.pattern.test(line));
    const isSkip = SKIP_PATTERN.test(line);

    if (matchedSection) {
      if (currentSection) sections.push(currentSection);
      currentSection = { type: matchedSection.type, lines: [] };
      const headerMatch = line.match(matchedSection.pattern);
      if (headerMatch) {
        const rest = line.substring(headerMatch[0].length).trim();
        if (rest) currentSection.lines.push(rest);
      }
    } else if (isSkip) {
      if (currentSection) sections.push(currentSection);
      currentSection = null;
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);
  return sections;
}

// ── Parseurs de sections ───────────────────────────────────────────────────

/**
 * Diplômes — supporte deux formats :
 * FR: "2023 – Licence, ESPRIT, Tunisie"
 * EN: "Bachelor of Science in Computer Science"  +  "University Name   2019 – 2023"
 */
function parseDiplomaEntries(lines, studentName) {
  const claims = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Format FR : commence par date
    const frMatch = line.match(/^(.+?)\s*[–\-—]\s*(.+)/);
    if (frMatch) {
      const dateResult = tryExtractDate(frMatch[1]);
      if (dateResult) {
        const parts = frMatch[2].split(',').map(p => p.trim()).filter(Boolean);
        const title = parts[0].replace(/\([^)]*\)/g, '').trim();
        const issuer = parts[1] || parts[0];
        if (title && issuer) {
          claims.push({ type: 'diploma', title, student: studentName, date: dateResult.date, issuer });
        }
        i++; continue;
      }
    }

    // Format EN : ligne titre de diplôme, ligne suivante = université + date
    // Détecte si la ligne ressemble à un titre de diplôme
    if (/^(Bachelor|Master|B\.?S\.?|M\.?S\.?|B\.?Sc|M\.?Sc|Ph\.?D|B\.?E\b|B\.?Tech|M\.?Tech|Licence|Ingénieur|Degree)/i.test(line)) {
      const title = line.trim();
      // Chercher université + date dans les lignes suivantes
      let issuer = null;
      let date = null;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j];
        if (SECTION_MAP.some(s => s.pattern.test(next)) || SKIP_PATTERN.test(next)) break;
        // Cherche une date dans la ligne
        const d = findDateAnywhere(next);
        if (d && !date) date = d;
        // L'université est la première ligne non-date après le titre
        if (!issuer && next && !/^\d{4}/.test(next) && !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(next)) {
          issuer = next.split(/\s{2,}|\t/)[0].trim();
        }
        if (issuer && date) break;
      }
      if (title && issuer) {
        claims.push({ type: 'diploma', title, student: studentName, date: date || '2020-01-01', issuer });
      }
    }

    i++;
  }
  return claims;
}

/**
 * Stages/Expériences — supporte deux formats :
 * FR: "juil. 2026 – Entreprise\nDescription du stage..."
 * EN: "Company Name   Jan 2023 – Dec 2023\nJob Title"
 *     ou "Job Title\nCompany   2023"
 */
function parseInternshipEntries(lines, studentName) {
  const claims = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Format FR : commence par date
    const frMatch = line.match(/^(.+?)\s*[–\-—]\s*(.+)/);
    if (frMatch) {
      const dateResult = tryExtractDate(frMatch[1]);
      if (dateResult) {
        const rest = frMatch[2];
        const issuer = rest.split(',')[0].split('(')[0].trim();
        let title = `Stage chez ${issuer}`;

        const stageMatch = rest.match(/(?:Stage\s+avec\s+\w+\s*:\s*|Stage\s+)([^.()]+)/i);
        if (stageMatch) {
          title = `Stage ${stageMatch[1].replace(/\([^)]*\)/g, '').trim()}`;
        } else {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const next = lines[j];
            if (!next) continue;
            const nextFr = next.match(/^(.+?)\s*[–\-—]\s*(.+)/);
            if (nextFr && tryExtractDate(nextFr[1])) break;
            const sm = next.match(/(?:Stage\s+avec\s+\w+\s*:\s*|Stage\s+)([^.()]+)/i);
            if (sm) { title = `Stage ${sm[1].replace(/\([^)]*\)/g, '').trim()}`; break; }
          }
        }
        claims.push({ type: 'internship', title: title.replace(/\s+/g, ' ').trim(), student: studentName, date: dateResult.date, issuer });
        i++; continue;
      }
    }

    // Format EN : "Company   Jan 2023 – Dec 2023"  (date à droite)
    // ou          "Company Name" seul + "Job Title" sur la ligne suivante
    const enDateRight = line.match(/^(.+?)\s{2,}(.+?\d{4})\s*[–\-—]?.*/);
    if (enDateRight) {
      const issuerCandidate = enDateRight[1].trim();
      const dateCandidate   = enDateRight[2].trim();
      const date = findDateAnywhere(dateCandidate);
      if (date && issuerCandidate.length > 2 && !/^\d/.test(issuerCandidate)) {
        // Chercher le titre de poste sur la ligne suivante
        let title = `Internship at ${issuerCandidate}`;
        if (i + 1 < lines.length) {
          const next = lines[i + 1];
          if (next && !findDateAnywhere(next) && !SECTION_MAP.some(s => s.pattern.test(next))) {
            title = next.trim();
          }
        }
        claims.push({ type: 'internship', title, student: studentName, date, issuer: issuerCandidate });
        i++; continue;
      }
    }

    // Format EN simple : "Job Title — Company, Date" ou "Job Title at Company (Date)"
    const enSimple = line.match(/^(.+?)\s+at\s+(.+?)[,\s]+(\d{4})/i);
    if (enSimple) {
      const title  = enSimple[1].trim();
      const issuer = enSimple[2].trim();
      const date   = enSimple[3] + '-01-01';
      claims.push({ type: 'internship', title, student: studentName, date, issuer });
      i++; continue;
    }

    i++;
  }
  return claims;
}

/**
 * Certifications — supporte :
 * FR: "Title – Issuer, Month YYYY"  /  "Title, Issuer, date"
 * EN: "Title – Issuer, Date"  /  "Title (Issuer) Date"  /  "Title, Date"
 */
function parseCertificationEntries(lines, studentName) {
  const claims = [];

  for (const line of lines) {
    // "Title – Issuer, date"
    const d1 = line.match(/^(.+?)\s*[–\-—]\s*(.+?),\s*(.+)$/);
    if (d1) {
      const date = normalizeDate(d1[3].trim());
      if (date) {
        claims.push({ type: 'certification', title: d1[1].trim(), student: studentName, date, issuer: d1[2].trim() });
        continue;
      }
    }

    // "Title – Issuer" (date introuvable → date courante)
    const d2 = line.match(/^(.+?)\s*[–\-—]\s*(.+)$/);
    if (d2 && d2[2].length > 3) {
      const title  = d2[1].trim();
      const issuer = d2[2].trim();
      if (title && issuer && !/^\d{4}$/.test(issuer)) {
        claims.push({ type: 'certification', title, student: studentName, date: '2024-01-01', issuer });
        continue;
      }
    }

    // "Title, Issuer, date"
    const parts = line.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const dateStr = parts[parts.length - 1];
      const date = normalizeDate(dateStr);
      if (date) {
        const title  = parts[0].replace(/\([^)]*\)/g, '').trim();
        const issuer = parts[parts.length - 2];
        claims.push({ type: 'certification', title, student: studentName, date, issuer });
        continue;
      }
    }

    // "Title (Issuer) Year"  — format commun pour certifs Coursera/Google
    const d3 = line.match(/^(.+?)\s*\(([^)]+)\)\s*(\d{4})?/);
    if (d3 && d3[2]) {
      const title  = d3[1].trim();
      const issuer = d3[2].trim();
      const date   = d3[3] ? d3[3] + '-01-01' : '2024-01-01';
      if (title && issuer) {
        claims.push({ type: 'certification', title, student: studentName, date, issuer });
      }
    }
  }

  return claims;
}

// ── Fonction principale ────────────────────────────────────────────────────

function extractFromText(cvText) {
  if (!cvText || typeof cvText !== 'string') {
    return { studentName: 'Candidat inconnu', claims: [] };
  }

  const text  = preprocessCvText(cvText);
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const studentName = extractStudentName(lines);
  const sections    = identifySections(lines);

  const claims = [];
  for (const section of sections) {
    let sc = [];
    switch (section.type) {
      case 'diploma':       sc = parseDiplomaEntries(section.lines, studentName); break;
      case 'internship':    sc = parseInternshipEntries(section.lines, studentName); break;
      case 'certification': sc = parseCertificationEntries(section.lines, studentName); break;
      case 'hackathon':
        sc = parseCertificationEntries(section.lines, studentName).map(c => ({ ...c, type: 'hackathon' }));
        break;
      case 'volunteer':
        sc = parseDiplomaEntries(section.lines, studentName).map(c => ({ ...c, type: 'volunteer' }));
        break;
    }
    claims.push(...sc);
  }

  return { studentName, claims };
}

module.exports = { extractFromText };
