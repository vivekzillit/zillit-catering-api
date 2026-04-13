// Call sheet text parser — extracts catering-relevant data from raw PDF text
// using regex heuristics. The patterns are designed against real call sheets
// from Lord of Misrule and Show Dogs productions but should generalise to
// most UK/US production call sheets.
//
// Every field is best-effort: if a regex doesn't match, the field stays
// empty and the caterer can manually override in the UI.

export interface ParsedCallSheet {
  shootDay: number;
  date: string;
  productionName: string;
  meals: {
    type: 'breakfast' | 'lunch' | 'dinner' | 'craft_service' | 'other';
    startTime: string;
    endTime: string;
    location: string;
    notes: string;
  }[];
  wrapTime: string;
  unitCall: string;
  estimatedHeadcount: number;
  cateringBase: string;
  crewContacts: { name: string; role: string; phone: string }[];
}

export function parseCallSheetText(text: string): ParsedCallSheet {
  const result: ParsedCallSheet = {
    shootDay: 0,
    date: '',
    productionName: '',
    meals: [],
    wrapTime: '',
    unitCall: '',
    estimatedHeadcount: 0,
    cateringBase: '',
    crewContacts: [],
  };

  // ── Shoot day ──
  const dayMatch = text.match(/CALL\s*SHEET\s*(\d+)/i);
  if (dayMatch) result.shootDay = parseInt(dayMatch[1], 10);

  // ── Date (various formats) ──
  const dateMatch = text.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+(\d{1,2}(?:st|nd|rd|th)?\s+\w+(?:\s+'\d{2}|\s+\d{4})?)/i
  );
  if (dateMatch) result.date = dateMatch[0].trim();
  else {
    const altDate = text.match(
      /(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b[^\n]*)/i
    );
    if (altDate) result.date = altDate[0].trim();
  }

  // ── Production name (usually near the top, before CALL SHEET) ──
  const prodMatch = text.match(/^(.+?)(?=\n.*CALL\s*SHEET)/is);
  if (prodMatch) {
    const lines = prodMatch[1].trim().split('\n').map((l) => l.trim()).filter(Boolean);
    // Take the longest non-person-name line as the production title
    const candidate = lines
      .filter((l) => l.length > 3 && !/^(Producer|Director|Exec)/i.test(l))
      .sort((a, b) => b.length - a.length)[0];
    if (candidate) result.productionName = candidate;
  }

  // ── Unit call ──
  const unitCallMatch = text.match(/UNIT\s*CALL[:\s]*(\d{4}|\d{2}[:.]\d{2})/i);
  if (unitCallMatch) result.unitCall = normaliseTime(unitCallMatch[1]);

  // ── Wrap time ──
  const wrapMatch = text.match(/(?:ESTIMATED\s*)?WRAP[:\s]*(\d{4}|\d{2}[:.]\d{2})/i);
  if (wrapMatch) result.wrapTime = normaliseTime(wrapMatch[1]);
  if (!result.wrapTime) {
    // Try just "WRAP:" followed by a 4-digit time on a nearby line
    const wrapAlt = text.match(/WRAP[:\s]+\n?\s*(\d{4})/i);
    if (wrapAlt) result.wrapTime = normaliseTime(wrapAlt[1]);
  }

  // ── Breakfast ──
  // Try range first: "BREAKFAST ... 0800 - 0900" or "from: 08:00"
  const bfRange = text.match(
    /BREAKFAST[^\n]*?(\d{4}|\d{2}[:.]\d{2})\s*[-–to]+\s*(\d{4}|\d{2}[:.]\d{2})/i
  );
  if (bfRange) {
    result.meals.push({
      type: 'breakfast',
      startTime: normaliseTime(bfRange[1]),
      endTime: normaliseTime(bfRange[2]),
      location: extractNearby(text, /BREAKFAST/i, /(?:at|@|served\s+at)\s+(.+)/i),
      notes: '',
    });
  } else {
    // Single time: "Breakfast @ UB from: 08:00"
    const bfSingle = text.match(
      /BREAKFAST[^\n]*?(?:from[:\s]*)?(\d{4}|\d{2}[:.]\d{2})/i
    );
    if (bfSingle) {
      result.meals.push({
        type: 'breakfast',
        startTime: normaliseTime(bfSingle[1]),
        endTime: '',
        location: extractNearby(text, /BREAKFAST/i, /(?:at|@)\s+(\S+)/i),
        notes: '',
      });
    }
  }

  // ── Lunch ──
  const lunchMatch = text.match(
    /(?:HOUR\s*)?LUNCH[:\s]*(\d{4}|\d{2}[:.]\d{2})\s*[-–to]+\s*(\d{4}|\d{2}[:.]\d{2})/i
  );
  if (lunchMatch) {
    const isRunning = /running\s*lunch/i.test(text);
    result.meals.push({
      type: 'lunch',
      startTime: normaliseTime(lunchMatch[1]),
      endTime: normaliseTime(lunchMatch[2]),
      location: extractNearby(text, /LUNCH/i, /(?:served\s+at|@)\s+(.+)/i),
      notes: isRunning ? 'Running lunch' : '',
    });
  }

  // ── Craft service ──
  const craftMatch = text.match(/CRAFT\s*SERV[A-Z]*[:\s]*(?:from\s*)?(\d{2}[:.]\d{2})/i);
  if (craftMatch) {
    result.meals.push({
      type: 'craft_service',
      startTime: normaliseTime(craftMatch[1]),
      endTime: '',
      location: extractNearby(text, /CRAFT\s*SERV/i, /(?:on set|at|@)\s+(.+)/i),
      notes: '',
    });
  }

  // ── Catering base ──
  const cateringBaseMatch = text.match(
    /CATERING\s*(?:BASE|LOCATION)[:\s]+([^\n]+)/i
  );
  if (cateringBaseMatch) result.cateringBase = cateringBaseMatch[1].trim();

  // ── Crew contacts (name + phone number pairs) ──
  // Phone: at least 10 digits when stripped of spaces/dashes/parens.
  // This excludes times like "0800", "1400 - 1500", and short numbers.
  const phonePattern = /((?:\+?\d[\d\s()-]{9,}))/g;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const phonesOnLine = lines[i].match(phonePattern);
    if (phonesOnLine) {
      for (const rawPhone of phonesOnLine) {
        const phone = rawPhone.replace(/\s+/g, ' ').trim();
        // Verify it has enough actual digits (≥ 10) to be a real phone number
        const digitCount = phone.replace(/\D/g, '').length;
        if (digitCount < 10) continue;

        // Look for a name before the phone on the same line
        const before = lines[i].slice(0, lines[i].indexOf(rawPhone)).trim();
        // Look for a role on a nearby preceding line
        const roleLine = i > 0 ? lines[i - 1].trim() : '';
        const nameCandidate = before || roleLine;
        if (nameCandidate && nameCandidate.length > 2 && nameCandidate.length < 60) {
          result.crewContacts.push({
            name: nameCandidate,
            role: before ? roleLine : '',
            phone,
          });
        }
      }
    }
  }

  // ── Headcount — count unique crew contacts as a rough estimate ──
  result.estimatedHeadcount = result.crewContacts.length || 0;
  // Also try to count lines in the cast/crew table if crew contacts is low
  if (result.estimatedHeadcount < 10) {
    const nameLines = lines.filter(
      (l) => /^[A-Z][a-z]+ [A-Z][a-z]+/.test(l.trim()) && l.trim().length < 40
    );
    if (nameLines.length > result.estimatedHeadcount) {
      result.estimatedHeadcount = nameLines.length;
    }
  }

  return result;
}

function normaliseTime(raw: string): string {
  const cleaned = raw.replace(/[.]/g, ':');
  if (/^\d{4}$/.test(cleaned)) {
    return cleaned.slice(0, 2) + ':' + cleaned.slice(2);
  }
  return cleaned;
}

function extractNearby(text: string, anchor: RegExp, pattern: RegExp): string {
  const anchorIdx = text.search(anchor);
  if (anchorIdx === -1) return '';
  const nearby = text.slice(anchorIdx, anchorIdx + 300);
  const m = nearby.match(pattern);
  return m?.[1]?.trim() ?? '';
}
