import type { TranslationSchema } from './en'

/**
 * Urdu (اردو) — complete translation. Parity with `en` is enforced by tests.
 * Monetary values/numerals stay in Western digits (standard for Pakistani POS).
 */
export const ur: TranslationSchema = {
  app: {
    name: 'APEXPOS',
    tagline: 'آف لائن ریٹیل و ریستوران پی او ایس',
    loading: 'لوڈ ہو رہا ہے…',
    signOut: 'لاگ آؤٹ',
    lockScreen: 'اسکرین لاک کریں',
    networkOnline: 'نیٹ ورک: آن لائن',
    networkOffline: 'نیٹ ورک: آف لائن — مقامی طور پر کام جاری ہے',
    syncLocalOnly: 'مقامی موڈ (ہم آہنگی کنفیگر نہیں)',
    restart: 'ایپلیکیشن دوبارہ شروع کریں'
  },
  nav: {
    dashboard: 'ڈیش بورڈ',
    pos: 'پی او ایس',
    inventory: 'اسٹاک',
    purchasing: 'خریداری',
    floor: 'فلور',
    kitchen: 'کچن',
    customers: 'گاہک',
    reports: 'رپورٹس',
    settings: 'ترتیبات'
  },
  common: {
    save: 'محفوظ کریں',
    cancel: 'منسوخ کریں',
    delete: 'حذف کریں',
    edit: 'ترمیم کریں',
    close: 'بند کریں',
    back: 'واپس',
    next: 'اگلا',
    finish: 'سیٹ اپ مکمل کریں',
    search: 'تلاش',
    actions: 'اقدامات',
    status: 'حیثیت',
    date: 'تاریخ',
    total: 'کل',
    name: 'نام',
    quantity: 'مقدار',
    price: 'قیمت',
    cost: 'لاگت',
    notes: 'نوٹس',
    required: 'ضروری',
    optional: 'اختیاری',
    confirm: 'تصدیق کریں',
    clear: 'صاف کریں'
  },
  auth: {
    signIn: 'سائن اِن',
    signInTitle: 'اپنے ٹرمینل میں سائن اِن کریں',
    username: 'صارف نام',
    password: 'پاس ورڈ',
    pin: 'پِن',
    quickPin: 'پِن سے فوری سائن اِن',
    invalidCredentials: 'سائن اِن ناکام۔ ساکھ جانچیں۔',
    locked: 'مقفل',
    unlockWithPin: 'کھولنے کے لیے اپنا پِن درج کریں'
  },
  onboarding: {
    title: 'APEXPOS میں خوش آمدید',
    subtitle: 'آئیے آپ کا کاروبار سیٹ اپ کرتے ہیں۔ بعد میں ترتیبات سے سب کچھ بدلا جا سکتا ہے۔',
    step: 'مرحلہ {{current}} از {{total}}',
    resume: 'محفوظ شدہ پیش رفت بحال کی جا رہی ہے…',
    business: {
      title: 'کاروباری پروفائل',
      name: 'کاروبار کا نام',
      legalName: 'قانونی نام',
      address: 'پتہ',
      phone: 'فون',
      email: 'ای میل',
      taxId: 'ٹیکس / این ٹی این نمبر'
    },
    locale: {
      title: 'ملک اور زبان',
      country: 'ملک',
      language: 'زبان',
      timezone: 'ٹائم زون'
    },
    currency: {
      title: 'کرنسی',
      code: 'کرنسی کوڈ (ISO 4217)',
      codeHint: 'تین بڑے حروف، مثلاً PKR، USD، AED',
      symbolPosition: 'کرنسی علامت کی جگہ',
      before: 'رقم سے پہلے (₨ 100)',
      after: 'رقم کے بعد (100 ₨)'
    },
    tax: {
      title: 'ٹیکس سیٹ اپ',
      name: 'ٹیکس کا نام',
      rate: 'شرح (%)',
      inclusive: 'قیمتوں میں ٹیکس شامل ہے',
      exclusive: 'ٹیکس قیمتوں کے علاوہ لگے گا'
    },
    mode: {
      title: 'کاروباری طرز',
      retail: 'ریٹیل',
      retailHint: 'تیز کاؤنٹر چیک آؤٹ',
      restaurant: 'ریستوران',
      restaurantHint: 'ٹیبل، کورسز، کچن ڈسپلے',
      hybrid: 'ہائبرڈ',
      hybridHint: 'ریٹیل اور ریستوران دونوں'
    },
    administrator: {
      title: 'منتظم اکاؤنٹ',
      username: 'صارف نام',
      displayName: 'ظاہری نام',
      password: 'پاس ورڈ (کم از کم 8 حروف)',
      passwordConfirm: 'پاس ورڈ کی تصدیق',
      pin: 'فوری پِن (4–8 ہندسے)',
      pinConfirm: 'پِن کی تصدیق',
      mismatchPassword: 'پاس ورڈ مماثل نہیں',
      mismatchPin: 'پِن مماثل نہیں',
      hint: 'یہ اکاؤنٹ نظام کا مالک ہے۔ یہ اسناد محفوظ رکھیں۔'
    },
    theme: {
      title: 'ظاہری انداز',
      dark: 'گہرا',
      light: 'ہلکا',
      system: 'سسٹم کے مطابق'
    },
    register: {
      title: 'پہلا رجسٹر',
      name: 'رجسٹر کا نام',
      code: 'رجسٹر کوڈ',
      openingFloat: 'ابتدائی نقد بیلنس',
      hint: 'پہلی بار رجسٹر کھولتے وقت نقدی گِن کر تصدیق کریں گے۔'
    },
    hardware: {
      title: 'ہارڈویئر',
      subtitle: 'APEXPOS میں بلٹ اِن سمیلیٹرز ہیں تاکہ اصل ہارڈویئر لگانے سے پہلے سب کچھ آزمایا جا سکے۔',
      printer: 'رسید پرنٹر',
      drawer: 'کیش ڈرائر',
      simulator: 'بلٹ اِن سمیلیٹر',
      none: 'کوئی نہیں / بعد میں کنفیگر کریں'
    },
    demo: {
      title: 'ڈیمو ڈیٹا',
      load: 'ڈیمو کیٹلاگ لوڈ کریں (مصنوعات، مینیو، گاہک، 60 دن کی فروخت)',
      skip: 'خالی کیٹلاگ سے شروع کریں',
      hint: 'ڈیمو ڈیٹا جانچ کے لیے مفید ہے۔ بعد میں خودکار طور پر ہٹایا نہیں جا سکتا۔'
    },
    complete: {
      title: 'سیٹ اپ مکمل',
      body: 'آپ کا ورک اسپیس تیار ہے۔ ایپ دوبارہ شروع کریں اور منتظم اکاؤنٹ سے سائن اِن کریں۔',
      restart: 'دوبارہ شروع کر کے سائن اِن کریں'
    },
    error: 'سیٹ اپ میں خامی',
    validationFailed: 'براہ کرم اس مرحلے کا جائزہ لیں — کچھ خانے درست نہیں۔'
  },
  pos: {
    currentSale: 'موجودہ فروخت',
    searchPlaceholder: 'مصنوعات تلاش کریں یا بارکوڈ اسکین کریں…',
    emptyCart: 'کارٹ خالی ہے',
    emptyCartHint: 'بارکوڈ اسکین کریں یا مصنوعہ منتخب کریں',
    subtotal: 'ذیلی کل',
    discount: 'رعایت',
    tax: 'ٹیکس',
    total: 'کل رقم',
    checkout: 'چیک آؤٹ',
    hold: 'روکیں',
    recall: 'واپس بلائیں',
    clearCart: 'صاف کریں',
    cash: 'نقد',
    card: 'کارڈ',
    giftCard: 'گفٹ کارڈ',
    storeCredit: 'اسٹور کریڈٹ',
    tendered: 'وصول شدہ',
    change: 'باقی رقم',
    amountTendered: 'وصول شدہ رقم',
    completeSale: 'فروخت مکمل کریں',
    orderHeld: 'آرڈر روکا گیا',
    receipt: 'رسید',
    newSale: 'نئی فروخت',
    saleComplete: 'فروخت مکمل',
    parkSale: 'فروخت محفوظ کریں',
    dineIn: 'ڈائن اِن',
    takeaway: 'ٹیک اۓ وے',
    retail: 'ریٹیل',
    addCustomer: 'گاہک شامل کریں'
  },
  purchasing: {
    title: 'خریداری',
    suppliers: 'سپلائرز',
    purchaseOrders: 'خریداری آرڈرز',
    newSupplier: 'نیا سپلائر',
    newPo: 'نیا خریداری آرڈر',
    supplier: 'سپلائر',
    poNumber: 'پی او نمبر',
    expected: 'متوقع',
    items: 'اقلام',
    ordered: 'مطلوبہ',
    received: 'موصول',
    remaining: 'باقی',
    unitCost: 'فی یونٹ لاگت',
    draft: 'مسودہ',
    sent: 'بھجوا دیا',
    partial: 'جزوی موصول',
    receivedStatus: 'موصول شدہ',
    cancelled: 'منسوخ',
    send: 'بھیجا ہوا نشان لگائیں',
    receive: 'اسٹاک وصول کریں',
    cancelPo: 'پی او منسوخ کریں',
    addLine: 'لائن شامل کریں',
    contact: 'رابطہ',
    receiveNow: 'ابھی وصول کریں',
    fullyReceived: 'مکمل موصول',
    history: 'سرگزشت',
    validation: {
      qtyPositive: 'مقدار صفر سے زیادہ ہونی چاہیے'
    }
  },
  settings: {
    title: 'ترتیبات',
    business: 'کاروبار',
    localization: 'مقامی تغیرات',
    currencySection: 'کرنسی',
    pos: 'پوائنٹ آف سیل',
    security: 'سیکیورٹی',
    appearance: 'ظاہری انداز',
    hardware: 'ہارڈویئر',
    backup: 'بیک اپ اور بحالی',
    language: 'زبان',
    saved: 'ترتیبات محفوظ ہو گئیں'
  },
  errors: {
    generic: 'کچھ غلط ہو گیا',
    offline: 'یہ کارروائی فی الحال دستیاب نہیں',
    forbiddenDraw: 'آپ کو اس کارروائی کی اجازت نہیں'
  },
  accessibility: {
    skipToContent: 'مواد پر جائیں'
  }
}
