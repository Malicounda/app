import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

export const apiRequest = async <T = any>({
  url,
  method = 'GET',
  data,
  headers = {},
  ...rest
}: {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  headers?: Record<string, string>;
} & Omit<AxiosRequestConfig, 'url' | 'method' | 'data' | 'headers'>): Promise<T> => {
  try {
    const config: AxiosRequestConfig = {
      url,
      method,
      data,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...rest,
    };

    // Add authentication token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    const response: AxiosResponse<T> = await axios(config);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const errorMessage = error.response.data?.message || error.message;
      const customError = new Error(errorMessage);
      (customError as any).response = error.response;
      throw customError;
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('Aucune réponse du serveur. Veuillez vérifier votre connexion.');
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(error.message || 'Une erreur est survenue');
    }
  }
};
