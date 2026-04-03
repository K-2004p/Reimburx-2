import Tesseract from 'tesseract.js';

/**
 * Preprocesses an image to improve OCR accuracy.
 * Converts to grayscale and enhances contrast using a temporary Canvas.
 */
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src); // Fallback to original
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Advanced Image Processing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          // 1. Grayscale Conversion (Luminance method)
          const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
          
          // 2. Simple Thresholding & Contrast Enhancement
          // Push darks to black and lights to white
          const value = avg < 128 ? avg * 0.8 : Math.min(255, avg * 1.2);
          
          data[i] = value;     // R
          data[i+1] = value;   // G
          data[i+2] = value;   // B
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

export async function extractReceiptData(imageFile: File) {
  // 1. Image Preprocessing (Focusing on legibility)
  const processedImage = await preprocessImage(imageFile);

  // 2. OCR Recognition Engine
  const { data: { text } } = await Tesseract.recognize(
    processedImage,
    'eng',
    { 
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Neural Feed: ${Math.round(m.progress * 100)}%`);
        }
      }
    }
  );

  // 3. Normalization & Neural Cleaning
  const normalizedText = text
    .replace(/[|!\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\d)[SOso](\d)/g, '$10$2')
    .replace(/(\d)[liI](\d)/g, '$11$2')
    .replace(/[Bb](\d)/g, '8$1')
    .trim();
  
  const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // 4. Currency Detection — INR takes ABSOLUTE priority
  // Only flag USD if $ appears DIRECTLY before a digit (e.g., "$95") — no spaces allowed
  const hasINRMarker = /₹|Rs\.?\s*\d|\bINR\b|\bRUPEE|\bPAISA/i.test(normalizedText);
  const hasUSDMarker = /\$\d|\bUSD\b|\bDOLLAR\b/i.test(normalizedText);
  // Only convert if it's clearly USD AND there's absolutely no INR marker on the receipt
  const isUSD = hasUSDMarker && !hasINRMarker;
  let detectedCurrency = 'INR'; // Default to INR (Indian app)

  // 5. Smarter Amount Extraction
  // Capture: $95.21, Rs.500, ₹1200, 95.21, 500, 1,200.00
  const priceRegex = /(?:[$₹]|Rs\.?\s*)?\s*(\d{1,6}(?:[,]\d{3})*(?:[.]\d{1,2})?|\d{1,6}(?:[.]\d{1,2})?)/g;
  const totalKeywords   = /TOTAL|GRAND\s*TOTAL|AMOUNT\s*DUE|NET\s*PAYABLE|PAYABLE|BILL\s*AMT|NET\s*AMT/i;
  const subtotalKeywords = /SUBTOTAL|TAX|VAT|GST|TIP|SERVICE\s*CHG|DISCOUNT/i;
  const currencyPrefix   = /[$₹]/;

  let candidates: { val: string; score: number }[] = [];

  rawLines.forEach((line, idx) => {
    const matches = Array.from(line.matchAll(priceRegex));
    matches.forEach(match => {
      // Clean commas (e.g. 1,200.00 → 1200.00)
      const cleaned = match[1].replace(/,/g, '');
      const numVal = parseFloat(cleaned);
      if (isNaN(numVal) || numVal <= 0 || numVal > 999999) return;

      let score = 0;

      // Position bonus: totals appear at bottom
      score += (idx / rawLines.length) * 50;

      // Keyword bonuses
      if (totalKeywords.test(line)) score += 200;
      if (idx > 0 && totalKeywords.test(rawLines[idx - 1])) score += 120;

      // Currency symbol bonus ($ or ₹ right next to the number)
      if (currencyPrefix.test(match[0])) score += 30;

      // Subtotal/tax penalties
      if (subtotalKeywords.test(line)) score -= 150;
      if (idx > 0 && subtotalKeywords.test(rawLines[idx - 1])) score -= 80;

      // Small number penalty (quantities, not prices)
      if (numVal < 5) score -= 60;

      candidates.push({ val: cleaned, score });
    });
  });

  // ── FAST PATH: Find any line with "Total" and grab the biggest number from it ──
  let finalAmount = '';
  let finalCurrency = detectedCurrency;
  let fastPathAmount = 0;

  // Search bottom-up for any line containing "total" (case-insensitive)
  for (let i = rawLines.length - 1; i >= 0; i--) {
    const line = rawLines[i];
    // Match lines with total-like keywords (loose: handles OCR typos like "Totai", "Tota1")
    if (/tot[a@]l|grand.?tot|amount.?due|payable|bill.?amt|net.?amt/i.test(line)) {
      // Extract ALL numbers from this line
      const allNums = line.match(/\d+(?:[.,]\d+)?/g);
      if (allNums) {
        // Pick the largest number (total > quantity always)
        const amounts = allNums.map(n => parseFloat(n.replace(',', '.')));
        const biggest = Math.max(...amounts);
        if (biggest > 0 && biggest < 999999) {
          fastPathAmount = biggest;
          break;
        }
      }
      // If total keyword found but no number on same line, check next line
      if (i + 1 < rawLines.length) {
        const nextNums = rawLines[i + 1].match(/\d+(?:[.,]\d+)?/g);
        if (nextNums) {
          const amounts = nextNums.map(n => parseFloat(n.replace(',', '.')));
          const biggest = Math.max(...amounts);
          if (biggest > 0 && biggest < 999999) {
            fastPathAmount = biggest;
            break;
          }
        }
      }
    }
  }

  if (fastPathAmount > 0) {
    // Direct hit — use this, skip scoring
    let rawAmount = fastPathAmount;
    if (isUSD && !hasINRMarker) {
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await res.json();
        const rate = data.rates?.INR || 84;
        rawAmount = Math.round(rawAmount * rate * 100) / 100;
        finalCurrency = 'INR';
      } catch {
        rawAmount = Math.round(rawAmount * 84 * 100) / 100;
        finalCurrency = 'INR';
      }
    }
    finalAmount = rawAmount.toFixed(2);
  } else if (candidates.length > 0) {
    // Fallback scoring when no "Total" line was found at all
    const maxVal = Math.max(...candidates.map(c => parseFloat(c.val)));
    candidates.forEach(c => {
      if (parseFloat(c.val) === maxVal) c.score += 40;
    });
    candidates.sort((a, b) => b.score - a.score);
    let rawAmount = parseFloat(candidates[0].val);
    if (isUSD && !hasINRMarker) {
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await res.json();
        const rate = data.rates?.INR || 84;
        rawAmount = Math.round(rawAmount * rate * 100) / 100;
        finalCurrency = 'INR';
      } catch {
        rawAmount = Math.round(rawAmount * 84 * 100) / 100;
        finalCurrency = 'INR';
      }
    }
    finalAmount = rawAmount.toFixed(2);
  }

  // 6. Robust Multi-Pass Date Extraction
  let finalDate = new Date().toISOString().split('T')[0];
  const dateKeywords = /(?:DATE|ISSUED|DT|BILL DATE|INV DATE|TIME)/i;
  const datePatterns = [
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/,
    /((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-z]*[\s.]\d{1,2}[\s,.]\d{2,4})/i,
    /(\d{1,2}[\s.]?(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-z]*[\s,.]\d{2,4})/i
  ];

  let bestDateStr = '';
  for (const line of rawLines) {
    if (dateKeywords.test(line)) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) { bestDateStr = match[1]; break; }
      }
    }
    if (bestDateStr) break;
  }
  if (!bestDateStr) {
    for (const pattern of datePatterns) {
      const match = normalizedText.match(pattern);
      if (match) { bestDateStr = match[1]; break; }
    }
  }
  if (bestDateStr) {
    try {
      const d = new Date(bestDateStr.replace(/[|.!\\]/g, '/'));
      if (!isNaN(d.getTime())) {
        const yr = d.getFullYear();
        if (yr > 2000 && yr <= new Date().getFullYear()) {
          finalDate = `${yr}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
      }
    } catch (e) { console.warn('Date parse error', e); }
  }

  // 7. Category Classification
  const lowerText = normalizedText.toLowerCase();
  let category = 'Other';
  const taxonomy: { [key: string]: string[] } = {
    'Travel':          ['flight','airline','airways','uber','lyft','taxi','train','bus','fuel','petrol','parking','ola','rapido'],
    'Meals':           ['coffee','starbucks','restaurant','cafe','bistro','grill','burger','pizza','food','mcdonalds','kfc','toast','burrito','latte','juice','breakfast','lunch','dinner','dessert','dominos','swiggy','zomato'],
    'Accommodation':   ['hotel','motel','inn','suites','lodge','stay','booking.com','airbnb','oyo'],
    'Software':        ['software','cloud','aws','google','microsoft','subscription','api','saas','github','zoom','heroku','vercel','adobe','figma'],
    'Office Supplies': ['staples','office','paper','ink','printer','amazon','stationary','walmart','target','ikea'],
    'Medical':         ['health','hospital','medical','pharmacy','medicine','dental','clinic','apollo']
  };
  for (const [cat, words] of Object.entries(taxonomy)) {
    if (words.some(w => lowerText.includes(w))) { category = cat; break; }
  }

  // 8. Merchant Identification
  const commonNoise  = /TAX INVOICE|CASH MEMO|RECEIPT|WELCOME|RETAIL|DUPLICATE|OFFICIAL/i;
  const addressMarkers = /MAIN STREET|BROOKLYN|NY\b|STREET|AVENUE|ROAD|BLVD|HIGHWAY|LANE|FLOOR|LEVEL|UNIT/i;
  const categoryNames  = new RegExp(`^(${Object.keys(taxonomy).join('|')}|FOOD|LUNCH|DINNER)$`, 'i');
  let merchant = 'Scanned Merchant';
  for (let i = 0; i < Math.min(5, rawLines.length); i++) {
    const line = rawLines[i].trim();
    if (!commonNoise.test(line) && !addressMarkers.test(line) && !categoryNames.test(line) && line.length > 3) {
      merchant = line.replace(/[^a-zA-Z0-9\s.-]/g, '').trim();
      break;
    }
  }

  return {
    rawText:     normalizedText,
    amount:      finalAmount,
    date:        finalDate,
    merchant:    merchant,
    category:    category,
    currency:    finalCurrency,
    description: `Asset generated from ${merchant} via AI Scanning.`
  };
}

// Voice Parsing Logic
export const parseVoiceCommand = (text: string) => {
  const lowercase = text.toLowerCase();
  const result: any = {};

  // Extract Amount (Expanded NLP logic)
  const amountMatch = lowercase.match(/(\d+(?:\.\d+)?)\s*(?:rupees|inr|dollars|rs\.?|bucks)/i) || 
                      lowercase.match(/(?:spent|paid|cost|total|bill|was|is)\s*(\d+(?:\.\d+)?)/i) ||
                      lowercase.match(/(\d+(?:\.\d+)?)/); // Fallback to any number
  
  if (amountMatch) {
    const val = amountMatch[amountMatch.length - 1];
    // Simple check to avoid picking up the year (e.g., 2026) as an amount
    if (parseFloat(val) < 100000) { 
      result.amount = val;
    }
  }

  // Extract Merchant (Disambiguated from category)
  const categoryKeywords = ['travel', 'meals', 'office supplies', 'software', 'food', 'lunch', 'dinner'];
  const merchantMatch = lowercase.match(/(?:at|on|from)\s+([^,.\s]+(?:\s+[^,.\s]+)?)/i);
  if (merchantMatch) {
    const potentialMerchant = merchantMatch[1].replace(/\b(?:yesterday|today|last)\b/g, '').trim();
    // If the "merchant" we found is just a category name, keep searching
    if (!categoryKeywords.includes(potentialMerchant.toLowerCase())) {
      result.merchant = potentialMerchant.toUpperCase();
    }
  }

  // Extract Date
  const today = new Date();
  if (lowercase.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    result.date = yesterday.toISOString().split('T')[0];
  } else if (lowercase.includes('today')) {
    result.date = today.toISOString().split('T')[0];
  } else {
    // Check for "last [weekday]"
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayMatch = lowercase.match(/last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
    if (dayMatch) {
      const targetDay = weekdays.indexOf(dayMatch[1].toLowerCase());
      const currentDay = today.getDay();
      const diff = currentDay <= targetDay ? 7 - (targetDay - currentDay) : currentDay - targetDay;
      const lastDay = new Date(today);
      lastDay.setDate(today.getDate() - diff);
      result.date = lastDay.toISOString().split('T')[0];
    }
  }

  // Extract Category (Smart Mapping)
  const categoryMap: Record<string, string[]> = {
    'Travel': ['uber', 'lyft', 'taxi', 'ola', 'flight', 'indigo', 'airtel', 'petrol', 'fuel'],
    'Meals': ['starbucks', 'mcdonalds', 'dinner', 'lunch', 'breakfast', 'food', 'restaurant', 'dominos', 'pizza'],
    'Office Supplies': ['amazon', 'staples', 'paper', 'pen', 'office'],
    'Software': ['cloud', 'aws', 'google', 'subscription', 'software', 'adobe', 'figma']
  };

  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => lowercase.includes(k))) {
      result.category = cat;
      break;
    }
  }

  return result;
};
