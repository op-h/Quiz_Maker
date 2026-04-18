/**
 * Shared Data & Utilities for CTF Platform
 */

window.CTF_DATA = window.CTF_DATA || {};

// SHA-256 for new content, with legacy verification support for older 8-char hashes.
window.CTF_DATA.normalizeInput = (str) => String(str).toLowerCase().trim();

window.CTF_DATA.legacyEncodeInput = (str) => {
  let h = 0x811c9dc5;
  const s = window.CTF_DATA.normalizeInput(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

window.CTF_DATA.encodeInput = (str) => {
  const s = window.CTF_DATA.normalizeInput(str);
  const bytes = Array.from(new TextEncoder().encode(s));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  bytes.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255);
  bytes.push((low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const W = new Array(64);
    for (let i = 0; i < 16; i++) {
      const base = offset + (i * 4);
      W[i] = (((bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3]) >>> 0);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotateRight(W[i - 15], 7) ^ rotateRight(W[i - 15], 18) ^ (W[i - 15] >>> 3)) >>> 0;
      const s1 = (rotateRight(W[i - 2], 17) ^ rotateRight(W[i - 2], 19) ^ (W[i - 2] >>> 10)) >>> 0;
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((value) => value.toString(16).padStart(8, '0')).join('');
};

window.CTF_DATA.verifyInput = (str, expectedHash) => {
  const hash = String(expectedHash || '').toLowerCase().trim();
  if (!hash) return false;
  if (/^[0-9a-f]{64}$/.test(hash)) return window.CTF_DATA.encodeInput(str) === hash;
  if (/^[0-9a-f]{8}$/.test(hash)) return window.CTF_DATA.legacyEncodeInput(str) === hash;
  return false;
};

window.CTF_DATA.defaultChallenges = [
  { id: 1, topic: 'Web Design Fundamentals', q: 'A web application\'s front-end consists of three core technologies. HTML acts as the skeleton, CSS acts as the "clothes and style," but which language acts as the "movement and actions"?', qAr: 'تتكون الواجهة الأمامية لتطبيق الويب من ثلاث تقنيات أساسية. يعمل HTML كهيكل عظمي، ويعمل CSS كـ "الملابس والأسلوب"، ولكن ما هي اللغة التي تعمل كـ "الحركة والأفعال"؟', format: 'A single word', hash: '56d78aa1' },
  { id: 2, topic: 'Web Design Fundamentals', q: 'What specific term is used to describe a website design that automatically adapts to different screen sizes (mobile, tablet, desktop) without forcing the user to pinch and zoom?', qAr: 'ما هو المصطلح المحدد المستخدم لوصف تصميم موقع ويب يتكيف تلقائيًا مع أحجام الشاشات المختلفة (الهاتف المحمول، الجهاز اللوحي، سطح المكتب) دون إجبار المستخدم على التكبير والتصغير؟', format: 'Two words', hash: '05e3230a' },
  { id: 3, topic: 'Basic HTML Structure', q: 'Every HTML page has a main container that wraps the content displayed in the browser window. What is the exact opening tag for this main visual container?', qAr: 'تحتوي كل صفحة HTML على حاوية رئيسية تغلف المحتوى المعروض في نافذة المتصفح. ما هو وسم الفتح الدقيق لهذه الحاوية المرئية الرئيسية؟', format: '<tag>', hash: '1de55ee3' },
  { id: 4, topic: 'Basic HTML Structure', q: 'You want to add a visible horizontal line to break up sections of your document. Which empty element tag do you use?', qAr: 'تريد إضافة خط أفقي مرئي لتقسيم أقسام المستند الخاص بك. ما هو وسم العنصر الفارغ الذي تستخدمه؟', format: '<tag>', hash: '2b7ba1b7' },
  { id: 5, topic: 'Basic HTML Structure', q: 'You need to leave a hidden note in your HTML code that the browser will not display. Write the exact 4-character syntax used to open an HTML comment.', qAr: 'تحتاج إلى ترك ملاحظة مخفية في كود HTML الخاص بك والتي لن يعرضها المتصفح. اكتب الصيغة الدقيقة المكونة من 4 أحرف والمستخدمة لفتح تعليق HTML.', format: 'symbol', hash: '8f7bf841' },
  { id: 6, topic: 'Text Formatting & Inline Elements', q: 'You are writing the chemical formula for water (H₂O) on your webpage. Which specific HTML tag must you wrap around the number "2" to display it beneath the other characters?', qAr: 'أنت تكتب الصيغة الكيميائية للماء (H₂O) على صفحة الويب الخاصة بك. ما هو وسم HTML المحدد الذي يجب أن تغلف به الرقم "2" لعرضه أسفل الأحرف الأخرى؟', format: '<tag>', hash: 'a5563a34' },
  { id: 7, topic: 'Text Formatting & Inline Elements', q: 'You want to apply a yellow highlight to an important sentence. Which HTML tag applies this marked yellow ink effect?', qAr: 'تريد تطبيق تمييز أصفر على جملة مهمة. ما هو وسم HTML الذي يطبق تأثير الحبر الأصفر المميز هذا؟', format: '<tag>', hash: 'f27ad42d' },
  { id: 8, topic: 'Text Formatting & Inline Elements', q: 'You are using CSS to change the text color of a specific word inside a paragraph without breaking the line. What inline tag should you wrap the word in?', qAr: 'أنت تستخدم CSS لتغيير لون نص كلمة معينة داخل فقرة دون كسر السطر. ما هو الوسم المضمن (inline tag) الذي يجب أن تغلف الكلمة به؟', format: '<tag>', hash: 'f6b28eb9' },
  { id: 9, topic: 'Media and Lists', q: 'You are embedding an image of a flower into your site. Fill in the exact missing attribute name to make this code work: <img ______="flower.jpg" alt="Flower">', qAr: 'أنت تقوم بتضمين صورة زهرة في موقعك. املأ اسم السمة المفقودة الدقيقة لجعل هذا الكود يعمل: <img ______="flower.jpg" alt="Flower">', format: 'attribute name only', hash: 'b1706c9e' },
  { id: 10, topic: 'Media and Lists', q: 'You are building an ordered list (<ol>), but instead of numbers (1, 2, 3), you want it to display uppercase letters (A, B, C). Fill in the blank with the correct attribute name: <ol ______="A">', qAr: 'أنت تقوم ببناء قائمة مرتبة (<ol>)، ولكن بدلاً من الأرقام (1، 2، 3)، تريد أن تعرض أحرفًا كبيرة (A، B، C). املأ الفراغ باسم السمة الصحيح: <ol ______="A">', format: 'attribute name only', hash: '439612ee' },
  { id: 11, topic: 'Media and Lists', q: 'You are building a Definition List (<dl>). You have already added the definition term (<dt>). What exact tag do you use next to contain the explanation/description of that term?', qAr: 'أنت تقوم ببناء قائمة تعريف (<dl>). لقد أضفت بالفعل مصطلح التعريف (<dt>). ما هو الوسم الدقيق الذي تستخدمه بعد ذلك لاحتواء شرح/وصف ذلك المصطلح؟', format: '<tag>', hash: '12d8a43f' },
  { id: 12, topic: 'HTML Tables', q: 'By default, HTML tables do not have visible lines separating the cells. What exact attribute do you add to the <table> tag to fix this?', qAr: 'بشكل افتراضي، لا تحتوي جداول HTML على خطوط مرئية تفصل بين الخلايا. ما هي السمة الدقيقة التي تضيفها إلى وسم <table> لإصلاح ذلك؟', format: 'attribute name only', hash: '56ab72f6' },
  { id: 13, topic: 'HTML Tables', q: 'You are creating a table header that needs to stretch horizontally across two columns to group them together. Fill in the missing attribute: <th ______="2">Personal Details</th>', qAr: 'أنت تقوم بإنشاء رأس جدول يحتاج إلى الامتداد أفقيًا عبر عمودين لتجميعهما معًا. املأ السمة المفقودة: <th ______="2">Personal Details</th>', format: 'attribute name only', hash: '6c457317' },
  { id: 14, topic: 'HTML Tables', q: 'You want to add a descriptive title that sits directly above your table. Which specific tag must be nested just inside the <table> element to achieve this?', qAr: 'تريد إضافة عنوان وصفي يجلس مباشرة فوق الجدول الخاص بك. ما هو الوسم المحدد الذي يجب أن يكون متداخلًا داخل عنصر <table> مباشرة لتحقيق ذلك؟', format: '<tag>', hash: '1fc977b3' }
];

// Load active challenges (either from local storage overrides, or default)
window.CTF_DATA.getChallenges = () => {
  const saved = localStorage.getItem('__ctf_custom_challenges');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse custom challenges", e);
    }
  }
  return [...window.CTF_DATA.defaultChallenges];
};
