import axios from 'axios';

const API_KEY = import.meta.env.VITE_EXCHANGERATE_API_KEY;
const BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}`;

export async function getExchangeRate(from: string, to: string) {
  try {
    const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${from}`);
    return response.data.rates[to] || 1;
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return 1;
  }
}

export async function getCountryCurrency(countryCode: string) {
  try {
    const response = await axios.get(`https://restcountries.com/v3.1/alpha/${countryCode}`);
    const currencies = response.data[0].currencies;
    const currencyCode = Object.keys(currencies)[0];
    return {
      code: currencyCode,
      symbol: currencies[currencyCode].symbol,
      name: currencies[currencyCode].name
    };
  } catch (error) {
    console.error('Error fetching country currency:', error);
    return { code: 'USD', symbol: '$', name: 'US Dollar' };
  }
}

export async function getUserLocation() {
  try {
    const response = await axios.get('https://ipapi.co/json/');
    return response.data;
  } catch (error) {
    console.error('Error fetching user location:', error);
    return { country_code: 'US' };
  }
}
