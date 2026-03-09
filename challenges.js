/**
 * Shared Data & Utilities for CTF Platform
 */

window.CTF_DATA = window.CTF_DATA || {};

// Simple custom hashing/obfuscation to hide answers from source code readers
window.CTF_DATA.encodeInput = (str) => {
  let h = 0x811c9dc5;
  const s = String(str).toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
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
