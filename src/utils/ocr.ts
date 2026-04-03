export const processReceipt = async (file: File) => {
  // Mocking OCR processing
  return new Promise<any>((resolve) => {
    setTimeout(() => {
      resolve({
        amount: Math.floor(Math.random() * 1000) + 100,
        currency: 'Rs.',
        category: 'Travel',
        merchant: 'Mock Merchant',
        description: 'Mocked receipt processing',
        date: new Date().toISOString().split('T')[0],
      });
    }, 2000);
  });
};
