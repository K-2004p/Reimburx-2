import axios from 'axios';

export const getUserLocation = async () => {
  try {
    const response = await axios.get('https://ipapi.co/json/');
    return response.data;
  } catch (error) {
    console.error('Error getting user location', error);
    return null;
  }
};

export const getCountryCurrency = (countryCode: string) => {
  const countryToCurrency: { [key: string]: string } = {
    'IN': 'INR',
    'US': 'USD',
    'GB': 'GBP',
    'EU': 'EUR',
    'JP': 'JPY',
    // Add more as needed
  };
  return { code: countryToCurrency[countryCode] || 'USD' };
};
