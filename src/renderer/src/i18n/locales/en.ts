/**
 * English (source of truth). Every key here must exist in every locale —
 * enforced by tests/unit-independent parity test.
 */
export const en = {
  app: {
    name: 'APEXPOS',
    tagline: 'Offline-first Retail + Restaurant POS',
    loading: 'Loading…',
    signOut: 'Sign out',
    lockScreen: 'Lock screen',
    networkOnline: 'Network: online',
    networkOffline: 'Network: offline — working locally',
    syncLocalOnly: 'Local mode (sync not configured)',
    restart: 'Restart application'
  },
  nav: {
    dashboard: 'Dashboard',
    pos: 'POS',
    inventory: 'Inventory',
    purchasing: 'Purchasing',
    floor: 'Floor',
    kitchen: 'Kitchen',
    customers: 'Customers',
    reports: 'Reports',
    settings: 'Settings'
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    finish: 'Finish setup',
    search: 'Search',
    actions: 'Actions',
    status: 'Status',
    date: 'Date',
    total: 'Total',
    name: 'Name',
    quantity: 'Qty',
    price: 'Price',
    cost: 'Cost',
    notes: 'Notes',
    required: 'Required',
    optional: 'optional',
    confirm: 'Confirm',
    clear: 'Clear'
  },
  auth: {
    signIn: 'Sign in',
    signInTitle: 'Sign in to your terminal',
    username: 'Username',
    password: 'Password',
    pin: 'PIN',
    quickPin: 'Quick PIN sign-in',
    invalidCredentials: 'Sign-in failed. Check your credentials.',
    locked: 'Locked',
    unlockWithPin: 'Enter your PIN to unlock'
  },
  onboarding: {
    title: 'Welcome to APEXPOS',
    subtitle: 'Let’s set up your business. You can change everything later in Settings.',
    step: 'Step {{current}} of {{total}}',
    resume: 'Resuming saved progress…',
    business: {
      title: 'Business profile',
      name: 'Business name',
      legalName: 'Legal name',
      address: 'Address',
      phone: 'Phone',
      email: 'Email',
      taxId: 'Tax / NTN number'
    },
    locale: {
      title: 'Country & language',
      country: 'Country',
      language: 'Language',
      timezone: 'Timezone'
    },
    currency: {
      title: 'Currency',
      code: 'Currency code (ISO 4217)',
      codeHint: 'Three uppercase letters, e.g. PKR, USD, AED',
      symbolPosition: 'Currency symbol position',
      before: 'Before amount (₨ 100)',
      after: 'After amount (100 ₨)'
    },
    tax: {
      title: 'Tax setup',
      name: 'Tax name',
      rate: 'Rate (%)',
      inclusive: 'Prices include tax',
      exclusive: 'Tax added on top of prices'
    },
    mode: {
      title: 'Business mode',
      retail: 'Retail',
      retailHint: 'Fast counter checkout',
      restaurant: 'Restaurant',
      restaurantHint: 'Tables, courses, kitchen display',
      hybrid: 'Hybrid',
      hybridHint: 'Both retail and restaurant'
    },
    administrator: {
      title: 'Administrator account',
      username: 'Username',
      displayName: 'Display name',
      password: 'Password (min 8 characters)',
      passwordConfirm: 'Confirm password',
      pin: 'Quick PIN (4–8 digits)',
      pinConfirm: 'Confirm PIN',
      mismatchPassword: 'Passwords do not match',
      mismatchPin: 'PINs do not match',
      hint: 'This account owns the system. Store these credentials safely.'
    },
    theme: {
      title: 'Appearance',
      dark: 'Dark',
      light: 'Light',
      system: 'Follow system'
    },
    register: {
      title: 'First register',
      name: 'Register name',
      code: 'Register code',
      openingFloat: 'Opening cash float',
      hint: 'You will count and confirm the float on first register open.'
    },
    hardware: {
      title: 'Hardware',
      subtitle:
        'APEXPOS ships with built-in device simulators so you can evaluate everything before connecting real hardware.',
      printer: 'Receipt printer',
      drawer: 'Cash drawer',
      simulator: 'Built-in simulator',
      none: 'None / configure later'
    },
    demo: {
      title: 'Demo data',
      load: 'Load demo catalog (products, menu, customers, 60 days of sales)',
      skip: 'Start with an empty catalog',
      hint: 'Demo data is useful for evaluation. It cannot be removed automatically later.'
    },
    complete: {
      title: 'Setup complete',
      body: 'Your workspace is ready. Restart the application and sign in with your administrator account.',
      restart: 'Restart & sign in'
    },
    error: 'Setup error',
    validationFailed: 'Please review this step — some fields are invalid.'
  },
  pos: {
    currentSale: 'Current Sale',
    searchPlaceholder: 'Search products or scan barcode…',
    emptyCart: 'Cart is empty',
    emptyCartHint: 'Scan a barcode or click a product to begin',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    total: 'Total',
    checkout: 'Checkout',
    hold: 'Hold',
    recall: 'Recall',
    clearCart: 'Clear',
    cash: 'Cash',
    card: 'Card',
    giftCard: 'Gift card',
    storeCredit: 'Store credit',
    tendered: 'Tendered',
    change: 'Change',
    amountTendered: 'Amount tendered',
    completeSale: 'Complete sale',
    orderHeld: 'Order on hold',
    receipt: 'Receipt',
    newSale: 'New sale',
    saleComplete: 'Sale complete',
    parkSale: 'Park sale',
    dineIn: 'Dine-in',
    takeaway: 'Takeaway',
    retail: 'Retail',
    addCustomer: 'Add customer'
  },
  purchasing: {
    title: 'Purchasing',
    suppliers: 'Suppliers',
    purchaseOrders: 'Purchase orders',
    newSupplier: 'New supplier',
    newPo: 'New purchase order',
    supplier: 'Supplier',
    poNumber: 'PO #',
    expected: 'Expected',
    items: 'Items',
    ordered: 'Ordered',
    received: 'Received',
    remaining: 'Remaining',
    unitCost: 'Unit cost',
    draft: 'Draft',
    sent: 'Sent',
    partial: 'Partially received',
    receivedStatus: 'Received',
    cancelled: 'Cancelled',
    send: 'Mark as sent',
    receive: 'Receive stock',
    cancelPo: 'Cancel PO',
    addLine: 'Add line',
    contact: 'Contact',
    receiveNow: 'Receive now',
    fullyReceived: 'Fully received',
    history: 'History',
    validation: {
      qtyPositive: 'Quantity must be greater than zero'
    }
  },
  settings: {
    title: 'Settings',
    business: 'Business',
    localization: 'Localization',
    currencySection: 'Currency',
    pos: 'Point of sale',
    security: 'Security',
    appearance: 'Appearance',
    hardware: 'Hardware',
    backup: 'Backup & restore',
    language: 'Language',
    saved: 'Settings saved'
  },
  errors: {
    generic: 'Something went wrong',
    offline: 'This action is unavailable in the current state',
    forbiddenDraw: 'You do not have permission for this action'
  },
  accessibility: {
    skipToContent: 'Skip to content'
  }
}

export type TranslationSchema = typeof en
