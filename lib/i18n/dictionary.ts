import type { LanguageCode } from "./languages";

const english = {
  newQuestion: "New to HYMN?",
  yesNew: "Yes, I’m new",
  noLogin: "No, take me to login",
  callYou: "What should we call you?",
  contact: "Where can HYMN reach you if something important comes up?",
  dob: "What is your date of birth?",
  language: "Choose your preferred language",
  purpose: "What led you to HYMN today?",
  userType: "Which best describes you?",
  referral: "How did you hear about HYMN?",
  next: "Continue",
  back: "Back",
  complete: "complete"
} as const;

type Dictionary = Record<keyof typeof english, string>;
const curated: Partial<Record<LanguageCode, Partial<Dictionary>>> = {
  hi: { newQuestion: "HYMN पर पहली बार आए हैं?", yesNew: "हाँ, मैं नया हूँ", noLogin: "नहीं, लॉगिन पर जाएँ", callYou: "हम आपको किस नाम से बुलाएँ?", contact: "ज़रूरी होने पर HYMN आपसे कहाँ संपर्क करे?", dob: "आपकी जन्मतिथि क्या है?", language: "अपनी पसंदीदा भाषा चुनें", purpose: "आज आप HYMN पर क्यों आए?", userType: "आपका सबसे सही परिचय क्या है?", referral: "आपने HYMN के बारे में कहाँ सुना?", next: "आगे बढ़ें", back: "पीछे", complete: "पूर्ण" },
  mr: { newQuestion: "HYMN वर पहिल्यांदा आला आहात?", yesNew: "हो, मी नवीन आहे", callYou: "आम्ही तुम्हाला कोणत्या नावाने बोलवावे?", language: "तुमची पसंतीची भाषा निवडा", next: "पुढे", back: "मागे", complete: "पूर्ण" },
  pa: { newQuestion: "HYMN 'ਤੇ ਪਹਿਲੀ ਵਾਰ ਆਏ ਹੋ?", yesNew: "ਹਾਂ, ਮੈਂ ਨਵਾਂ ਹਾਂ", callYou: "ਅਸੀਂ ਤੁਹਾਨੂੰ ਕੀ ਕਹੀਏ?", language: "ਆਪਣੀ ਪਸੰਦੀਦਾ ਭਾਸ਼ਾ ਚੁਣੋ", next: "ਅੱਗੇ", back: "ਪਿੱਛੇ", complete: "ਪੂਰਾ" },
  bn: { newQuestion: "HYMN-এ প্রথমবার এসেছেন?", yesNew: "হ্যাঁ, আমি নতুন", callYou: "আমরা আপনাকে কী নামে ডাকব?", language: "আপনার পছন্দের ভাষা বেছে নিন", next: "এগিয়ে যান", back: "পিছনে", complete: "সম্পূর্ণ" },
  ta: { newQuestion: "HYMN-க்கு புதிதா?", yesNew: "ஆம், நான் புதியவர்", callYou: "உங்களை என்ன பெயரில் அழைக்கலாம்?", language: "உங்களுக்கு விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்", next: "தொடரவும்", back: "பின்செல்", complete: "முடிந்தது" },
  te: { newQuestion: "HYMNకు కొత్తా?", yesNew: "అవును, నేను కొత్త", callYou: "మిమ్మల్ని ఏమని పిలవాలి?", language: "మీకు నచ్చిన భాషను ఎంచుకోండి", next: "కొనసాగించండి", back: "వెనుకకు", complete: "పూర్తి" },
  gu: { newQuestion: "HYMN પર નવા છો?", yesNew: "હા, હું નવો છું", callYou: "અમે તમને કયા નામે બોલાવીએ?", language: "તમારી પસંદગીની ભાષા પસંદ કરો", next: "આગળ", back: "પાછળ", complete: "પૂર્ણ" },
  ur: { newQuestion: "HYMN پر نئے ہیں؟", yesNew: "ہاں، میں نیا ہوں", callYou: "ہم آپ کو کس نام سے پکاریں؟", language: "اپنی پسندیدہ زبان منتخب کریں", next: "آگے", back: "پیچھے", complete: "مکمل" }
};

export function getDictionary(language: LanguageCode): Dictionary {
  return { ...english, ...(curated[language] ?? {}) };
}

